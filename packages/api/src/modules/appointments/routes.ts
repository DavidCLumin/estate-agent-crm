import type { FastifyInstance } from 'fastify';
import { AppointmentRequestSchema } from '@estate/shared';
import { z } from 'zod';
import { createEvents } from 'ics';
import { withRequestContext } from '../../lib/context';
import { requireRole } from '../../lib/rbac';
import { AppError } from '../../lib/errors';
import { logAudit } from '../audit/service';
import { sendEmail } from '../../lib/notifications';

const IdParam = z.object({ id: z.string().uuid() });
const CompleteSchema = z.object({
  outcomeNote: z.string().max(1000).optional(),
  followUpAt: z.string().datetime().optional(),
});

export async function appointmentRoutes(app: FastifyInstance) {
  app.get('/appointments', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['BUYER', 'TENANT_ADMIN', 'AGENT']);
    const tenantId = app.resolveTenantId(request)!;

    return withRequestContext({ tenantId, role: auth.role }, (tx) =>
      tx.appointment.findMany({
        where: auth.role === 'BUYER' ? { buyerId: auth.userId, deletedAt: null } : { deletedAt: null },
        include: { property: true, buyer: { select: { id: true, name: true } }, agent: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  app.post('/appointments/request', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = request.auth!;
    requireRole(auth.role, ['BUYER']);
    const body = AppointmentRequestSchema.parse(request.body);
    const tenantId = app.resolveTenantId(request)!;

    const appointment = await withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const property = await tx.property.findFirst({ where: { id: body.propertyId, tenantId, deletedAt: null } });
      if (!property) throw new AppError(404, 'Property not found');
      if (property.status !== 'LIVE') throw new AppError(409, 'Property is not available for viewing requests');
      if (!property.assignedAgentId) throw new AppError(400, 'Property has no assigned agent');

      const created = await tx.appointment.create({
        data: {
          tenantId,
          propertyId: body.propertyId,
          buyerId: auth.userId,
          agentId: property.assignedAgentId,
          preferredStart: new Date(body.preferredStart),
          preferredEnd: new Date(body.preferredEnd),
          note: body.note,
        },
      });

      await logAudit(tx, {
        tenantId,
        userId: auth.userId,
        action: 'APPOINTMENT_REQUESTED',
        entity: 'Appointment',
        entityId: created.id,
      });

      // Agent follow-up reminder for new request.
      await tx.reminder.create({
        data: {
          tenantId,
          userId: property.assignedAgentId,
          appointmentId: created.id,
          propertyId: body.propertyId,
          title: `Review viewing request for ${property.title}`,
          body: `Buyer requested viewing at ${new Date(body.preferredStart).toLocaleString()}`,
          dueAt: new Date(),
          channel: 'IN_APP',
        },
      });

      return created;
    });

    await sendEmail({
      to: auth.email,
      subject: 'Viewing request submitted',
      text: `Your viewing request (${appointment.id}) has been submitted.`,
    });
    return reply.code(201).send(appointment);
  });

  app.post('/appointments/:id/approve', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN', 'AGENT']);
    const { id } = IdParam.parse(request.params);
    const tenantId = app.resolveTenantId(request)!;

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const existing = await tx.appointment.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!existing) throw new AppError(404, 'Appointment not found');

      const appointment = await tx.appointment.update({
        where: { id },
        data: { status: 'APPROVED' },
        include: {
          property: true,
          agent: { select: { id: true, name: true, email: true } },
          buyer: { select: { id: true, name: true, email: true } },
        },
      });
      await logAudit(tx, { tenantId, userId: auth.userId, action: 'APPOINTMENT_APPROVED', entity: 'Appointment', entityId: id });

      await tx.reminder.create({
        data: {
          tenantId,
          userId: appointment.buyerId,
          appointmentId: appointment.id,
          propertyId: appointment.propertyId,
          title: `Viewing confirmed: ${appointment.property.title}`,
          body: `Viewing approved for ${appointment.preferredStart.toLocaleString()}`,
          dueAt: appointment.preferredStart,
          channel: 'IN_APP',
        },
      });

      await sendEmail({
        to: appointment.buyer.email ?? '',
        subject: 'Viewing approved',
        text: `Viewing ${appointment.id} has been approved.`,
      });
      return appointment;
    });
  });

  app.post('/appointments/:id/decline', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN', 'AGENT']);
    const { id } = IdParam.parse(request.params);
    const tenantId = app.resolveTenantId(request)!;

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const existing = await tx.appointment.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!existing) throw new AppError(404, 'Appointment not found');
      const appointment = await tx.appointment.update({ where: { id }, data: { status: 'DECLINED' } });
      await logAudit(tx, { tenantId, userId: auth.userId, action: 'APPOINTMENT_DECLINED', entity: 'Appointment', entityId: id });
      return appointment;
    });
  });

  app.post('/appointments/:id/cancel', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['BUYER', 'TENANT_ADMIN', 'AGENT']);
    const { id } = IdParam.parse(request.params);
    const tenantId = app.resolveTenantId(request)!;

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const existing = await tx.appointment.findFirst({ where: { id, tenantId, deletedAt: null }, include: { property: true } });
      if (!existing) throw new AppError(404, 'Appointment not found');

      if (auth.role === 'BUYER' && existing.buyerId !== auth.userId) {
        throw new AppError(403, 'You can only cancel your own appointments');
      }

      if (existing.status === 'COMPLETED') {
        throw new AppError(409, 'Completed appointments cannot be cancelled');
      }

      const updated = await tx.appointment.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      await logAudit(tx, {
        tenantId,
        userId: auth.userId,
        action: 'APPOINTMENT_CANCELLED',
        entity: 'Appointment',
        entityId: id,
        metadata: { byRole: auth.role },
      });

      return updated;
    });
  });

  app.post('/appointments/:id/complete', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN', 'AGENT']);
    const { id } = IdParam.parse(request.params);
    const body = CompleteSchema.parse(request.body);
    const tenantId = app.resolveTenantId(request)!;

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const appointment = await tx.appointment.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          note: body.outcomeNote ? body.outcomeNote : undefined,
        },
        include: { property: true, buyer: true },
      });

      if (body.followUpAt) {
        await tx.reminder.create({
          data: {
            tenantId,
            userId: appointment.agentId,
            appointmentId: appointment.id,
            propertyId: appointment.propertyId,
            title: `Follow-up: ${appointment.property.title}`,
            body: body.outcomeNote ?? `Follow up with ${appointment.buyer.name} after viewing completion.`,
            dueAt: new Date(body.followUpAt),
            channel: 'IN_APP',
          },
        });
      }

      await logAudit(tx, {
        tenantId,
        userId: auth.userId,
        action: 'APPOINTMENT_COMPLETED',
        entity: 'Appointment',
        entityId: id,
      });

      return appointment;
    });
  });

  app.get('/appointments/:id/ics', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = request.auth!;
    const { id } = IdParam.parse(request.params);
    const tenantId = app.resolveTenantId(request)!;

    const appointment = await withRequestContext({ tenantId, role: auth.role }, (tx) =>
      tx.appointment.findFirst({ where: { id, tenantId, deletedAt: null }, include: { property: true } }),
    );

    if (!appointment || appointment.status !== 'APPROVED') throw new AppError(404, 'Approved appointment not found');

    const start = appointment.preferredStart;
    const end = appointment.preferredEnd;
    const { error, value } = createEvents([
      {
        start: [start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate(), start.getUTCHours(), start.getUTCMinutes()],
        end: [end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate(), end.getUTCHours(), end.getUTCMinutes()],
        title: `Viewing - ${appointment.property.title}`,
        description: appointment.property.address,
        status: 'CONFIRMED',
      },
    ]);

    if (error || !value) throw new AppError(500, 'Unable to generate calendar file');

    reply.header('Content-Type', 'text/calendar; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename=appointment-${id}.ics`);
    return reply.send(value);
  });
}
