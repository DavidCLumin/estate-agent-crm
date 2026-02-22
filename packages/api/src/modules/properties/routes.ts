import type { FastifyInstance } from 'fastify';
import { PropertyInputSchema } from '@estate/shared';
import { z } from 'zod';
import { withRequestContext } from '../../lib/context';
import { requireRole } from '../../lib/rbac';
import { AppError } from '../../lib/errors';
import { logAudit } from '../audit/service';
import { validatePropertyStatusTransition } from './rules';

const IdParam = z.object({ id: z.string().uuid() });

export async function propertyRoutes(app: FastifyInstance) {
  app.get('/properties', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    const tenantId = app.resolveTenantId(request);

    return withRequestContext({ tenantId, role: auth.role }, (tx) => {
      if (auth.role === 'BUYER') {
        // Buyer should not receive staff-only fields like minimumOffer.
        return tx.property.findMany({
          where: { deletedAt: null, status: 'LIVE' },
          select: {
            id: true,
            tenantId: true,
            title: true,
            address: true,
            eircode: true,
            description: true,
            priceGuide: true,
            status: true,
            biddingMode: true,
            biddingDeadline: true,
            minIncrement: true,
            createdById: true,
            assignedAgentId: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
            media: true,
            assignedAgent: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        });
      }

      return tx.property.findMany({
        where: { deletedAt: null },
        include: { media: true, assignedAgent: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  app.post('/properties', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN', 'AGENT']);
    const body = PropertyInputSchema.parse(request.body);
    const tenantId = app.resolveTenantId(request);
    if (!tenantId) throw new AppError(400, 'Tenant required');

    const property = await withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const created = await tx.property.create({
        data: {
          tenantId,
          title: body.title,
          address: body.address,
          eircode: body.eircode,
          description: body.description,
          priceGuide: body.priceGuide,
          minimumOffer: body.minimumOffer ?? null,
          status: body.status,
          biddingMode: body.biddingMode,
          biddingDeadline: body.biddingDeadline ? new Date(body.biddingDeadline) : null,
          minIncrement: body.minIncrement,
          createdById: auth.userId,
          assignedAgentId: body.assignedAgentId,
        },
      });

      await logAudit(tx, {
        tenantId,
        userId: auth.userId,
        action: 'PROPERTY_CREATED',
        entity: 'Property',
        entityId: created.id,
        ipAddress: request.ip,
      });

      return created;
    });

    return reply.code(201).send(property);
  });

  app.put('/properties/:id', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN', 'AGENT']);
    const params = IdParam.parse(request.params);
    const body = PropertyInputSchema.partial().parse(request.body);
    const tenantId = app.resolveTenantId(request);
    if (!tenantId) throw new AppError(400, 'Tenant required');

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const existing = await tx.property.findFirst({
        where: { id: params.id, tenantId, deletedAt: null },
      });
      if (!existing) throw new AppError(404, 'Property not found');

      if (body.status) {
        validatePropertyStatusTransition(existing.status, body.status);
      }

      const updated = await tx.property.update({
        where: { id: params.id },
        data: {
          title: body.title,
          address: body.address,
          eircode: body.eircode,
          description: body.description,
          priceGuide: body.priceGuide,
          minimumOffer: body.minimumOffer === undefined ? undefined : body.minimumOffer,
          status: body.status,
          biddingMode: body.biddingMode,
          biddingDeadline: body.biddingDeadline ? new Date(body.biddingDeadline) : undefined,
          assignedAgentId: body.assignedAgentId,
          minIncrement: body.minIncrement,
        },
      });

      await logAudit(tx, {
        tenantId,
        userId: auth.userId,
        action: body.status && body.status !== existing.status ? 'PROPERTY_STATUS_CHANGED' : 'PROPERTY_UPDATED',
        entity: 'Property',
        entityId: params.id,
        ipAddress: request.ip,
        metadata: body.status && body.status !== existing.status ? { from: existing.status, to: body.status } : undefined,
      });

      return updated;
    });
  });

  app.delete('/properties/:id', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN']);
    const params = IdParam.parse(request.params);
    const tenantId = app.resolveTenantId(request);

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const existing = await tx.property.findFirst({
        where: { id: params.id, tenantId: tenantId ?? undefined, deletedAt: null },
      });
      if (!existing) throw new AppError(404, 'Property not found');

      const deleted = await tx.property.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
      await logAudit(tx, {
        tenantId,
        userId: auth.userId,
        action: 'PROPERTY_DELETED',
        entity: 'Property',
        entityId: params.id,
        ipAddress: request.ip,
      });
      return deleted;
    });
  });

  app.post('/properties/:id/publish', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN', 'AGENT']);
    const params = IdParam.parse(request.params);
    const tenantId = app.resolveTenantId(request);
    if (!tenantId) throw new AppError(400, 'Tenant required');

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const existing = await tx.property.findFirst({
        where: { id: params.id, tenantId, deletedAt: null },
      });
      if (!existing) throw new AppError(404, 'Property not found');

      let published = existing;
      if (existing.status !== 'LIVE') {
        const updated = await tx.property.updateMany({
          where: { id: params.id, tenantId, deletedAt: null, status: { not: 'LIVE' } },
          data: { status: 'LIVE' },
        });

        // If nothing was updated, avoid leaking as 500 and return a clear error.
        if (updated.count === 0) {
          const latest = await tx.property.findFirst({
            where: { id: params.id, tenantId, deletedAt: null },
          });
          if (!latest) throw new AppError(404, 'Property not found');
          if (latest.status !== 'LIVE') throw new AppError(409, 'Could not publish property');
          published = latest;
        } else {
          const latest = await tx.property.findFirst({
            where: { id: params.id, tenantId, deletedAt: null },
          });
          if (!latest) throw new AppError(404, 'Property not found');
          published = latest;
        }
      }

      // Publishing should not fail if audit logging fails.
      try {
        await logAudit(tx, {
          tenantId,
          userId: auth.userId,
          action: 'PROPERTY_PUBLISHED',
          entity: 'Property',
          entityId: params.id,
          ipAddress: request.ip,
        });
      } catch (error) {
        request.log.error({ error, propertyId: params.id }, 'Failed to write PROPERTY_PUBLISHED audit log');
      }

      return published;
    });
  });
}
