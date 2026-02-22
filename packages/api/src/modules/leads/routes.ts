import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LeadInputSchema, LeadNoteInputSchema, ReminderInputSchema } from '@estate/shared';
import { withRequestContext } from '../../lib/context';
import { AppError } from '../../lib/errors';
import { logAudit } from '../audit/service';

const IdParam = z.object({ id: z.string().uuid() });

const LeadQuery = z.object({
  status: z
    .enum(['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING_BOOKED', 'OFFER_MADE', 'CLOSED_WON', 'CLOSED_LOST'])
    .optional(),
  assignedToMe: z.coerce.boolean().optional().default(false),
});

const ReminderQuery = z.object({
  includeCompleted: z.coerce.boolean().optional().default(false),
  mineOnly: z.coerce.boolean().optional().default(true),
});

function canManageLeads(role: string) {
  return role === 'TENANT_ADMIN' || role === 'AGENT' || role === 'SUPER_ADMIN';
}

export async function leadRoutes(app: FastifyInstance) {
  app.get('/leads', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    if (!canManageLeads(auth.role)) throw new AppError(403, 'Insufficient role permissions');

    const tenantId = app.resolveTenantId(request);
    if (!tenantId) throw new AppError(400, 'Tenant required');

    const query = LeadQuery.parse(request.query);

    return withRequestContext({ tenantId, role: auth.role }, (tx) =>
      tx.lead.findMany({
        where: {
          deletedAt: null,
          status: query.status,
          assignedAgentId: query.assignedToMe ? auth.userId : undefined,
        },
        include: {
          assignedAgent: { select: { id: true, name: true, email: true } },
          property: { select: { id: true, title: true, address: true } },
          notes: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { id: true, name: true } } },
          },
          reminders: {
            where: { completedAt: null },
            orderBy: { dueAt: 'asc' },
            take: 1,
          },
        },
        orderBy: [{ nextFollowUpAt: 'asc' }, { createdAt: 'desc' }],
      }),
    );
  });

  app.post('/leads', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = request.auth!;
    if (!canManageLeads(auth.role)) throw new AppError(403, 'Insufficient role permissions');

    const tenantId = app.resolveTenantId(request);
    if (!tenantId) throw new AppError(400, 'Tenant required');

    const body = LeadInputSchema.parse(request.body);

    const lead = await withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const created = await tx.lead.create({
        data: {
          tenantId,
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email,
          phone: body.phone,
          source: body.source,
          budgetMin: body.budgetMin,
          budgetMax: body.budgetMax,
          status: body.status,
          assignedAgentId: body.assignedAgentId,
          createdById: auth.userId,
          propertyId: body.propertyId,
          nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null,
        },
      });

      await logAudit(tx, {
        tenantId,
        userId: auth.userId,
        action: 'LEAD_CREATED',
        entity: 'Lead',
        entityId: created.id,
      });

      return created;
    });

    return reply.code(201).send(lead);
  });

  app.patch('/leads/:id', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    if (!canManageLeads(auth.role)) throw new AppError(403, 'Insufficient role permissions');

    const { id } = IdParam.parse(request.params);
    const body = LeadInputSchema.partial().parse(request.body);

    const tenantId = app.resolveTenantId(request);
    if (!tenantId) throw new AppError(400, 'Tenant required');

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const existing = await tx.lead.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) throw new AppError(404, 'Lead not found');

      const updated = await tx.lead.update({
        where: { id },
        data: {
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email,
          phone: body.phone,
          source: body.source,
          budgetMin: body.budgetMin,
          budgetMax: body.budgetMax,
          status: body.status,
          assignedAgentId: body.assignedAgentId,
          propertyId: body.propertyId,
          nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : undefined,
        },
      });

      await logAudit(tx, {
        tenantId,
        userId: auth.userId,
        action: 'LEAD_UPDATED',
        entity: 'Lead',
        entityId: id,
      });

      return updated;
    });
  });

  app.post('/leads/:id/notes', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = request.auth!;
    if (!canManageLeads(auth.role)) throw new AppError(403, 'Insufficient role permissions');

    const { id } = IdParam.parse(request.params);
    const body = LeadNoteInputSchema.parse(request.body);
    const tenantId = app.resolveTenantId(request);
    if (!tenantId) throw new AppError(400, 'Tenant required');

    const note = await withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id } });
      if (!lead || lead.deletedAt) throw new AppError(404, 'Lead not found');

      return tx.leadNote.create({
        data: {
          tenantId,
          leadId: id,
          userId: auth.userId,
          body: body.body,
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
    });

    return reply.code(201).send(note);
  });

  app.get('/leads/:id/notes', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    if (!canManageLeads(auth.role)) throw new AppError(403, 'Insufficient role permissions');

    const { id } = IdParam.parse(request.params);
    const tenantId = app.resolveTenantId(request);
    if (!tenantId) throw new AppError(400, 'Tenant required');

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id } });
      if (!lead || lead.deletedAt) throw new AppError(404, 'Lead not found');

      return tx.leadNote.findMany({
        where: { leadId: id },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
    });
  });

  app.get('/reminders', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    if (!canManageLeads(auth.role) && auth.role !== 'BUYER') throw new AppError(403, 'Insufficient role permissions');

    const query = ReminderQuery.parse(request.query);
    const tenantId = app.resolveTenantId(request);
    if (!tenantId) throw new AppError(400, 'Tenant required');

    return withRequestContext({ tenantId, role: auth.role }, (tx) =>
      tx.reminder.findMany({
        where: {
          userId: query.mineOnly ? auth.userId : undefined,
          completedAt: query.includeCompleted ? undefined : null,
        },
        include: {
          lead: { select: { id: true, firstName: true, lastName: true, status: true } },
          property: { select: { id: true, title: true, address: true } },
          appointment: { select: { id: true, status: true, preferredStart: true } },
          user: { select: { id: true, name: true } },
        },
        orderBy: [{ completedAt: 'asc' }, { dueAt: 'asc' }],
      }),
    );
  });

  app.post('/reminders', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = request.auth!;
    if (!canManageLeads(auth.role) && auth.role !== 'BUYER') throw new AppError(403, 'Insufficient role permissions');

    const body = ReminderInputSchema.parse(request.body);
    const tenantId = app.resolveTenantId(request);
    if (!tenantId) throw new AppError(400, 'Tenant required');

    const reminder = await withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const created = await tx.reminder.create({
        data: {
          tenantId,
          userId: body.userId ?? auth.userId,
          leadId: body.leadId,
          propertyId: body.propertyId,
          appointmentId: body.appointmentId,
          title: body.title,
          body: body.body,
          channel: body.channel,
          dueAt: new Date(body.dueAt),
        },
      });

      await logAudit(tx, {
        tenantId,
        userId: auth.userId,
        action: 'REMINDER_CREATED',
        entity: 'Reminder',
        entityId: created.id,
      });

      return created;
    });

    return reply.code(201).send(reminder);
  });

  app.post('/reminders/:id/complete', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    const { id } = IdParam.parse(request.params);

    const tenantId = app.resolveTenantId(request);
    if (!tenantId) throw new AppError(400, 'Tenant required');

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const existing = await tx.reminder.findUnique({ where: { id } });
      if (!existing) throw new AppError(404, 'Reminder not found');
      if (existing.userId !== auth.userId && auth.role !== 'TENANT_ADMIN' && auth.role !== 'SUPER_ADMIN') {
        throw new AppError(403, 'Insufficient role permissions');
      }

      const updated = await tx.reminder.update({
        where: { id },
        data: { completedAt: existing.completedAt ? null : new Date() },
      });

      await logAudit(tx, {
        tenantId,
        userId: auth.userId,
        action: 'REMINDER_TOGGLED',
        entity: 'Reminder',
        entityId: id,
      });

      return updated;
    });
  });
}
