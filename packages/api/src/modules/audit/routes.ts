import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withRequestContext } from '../../lib/context';
import { requireRole } from '../../lib/rbac';

export async function auditRoutes(app: FastifyInstance) {
  app.get('/audit-logs', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN', 'AGENT', 'SUPER_ADMIN']);
    const query = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        action: z.string().optional(),
      })
      .parse(request.query);
    const tenantId = app.resolveTenantId(request);

    return withRequestContext({ tenantId, role: auth.role }, (tx) =>
      tx.auditLog.findMany({
        where: {
          action: query.action,
          createdAt: {
            gte: query.from ? new Date(query.from) : undefined,
            lte: query.to ? new Date(query.to) : undefined,
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  app.get('/gdpr/export', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    const tenantId = app.resolveTenantId(request);

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: auth.userId } });
      const bids = await tx.bid.findMany({ where: { buyerUserId: auth.userId } });
      const appointments = await tx.appointment.findMany({ where: { buyerId: auth.userId } });
      return { user, bids, appointments };
    });
  });

  app.post('/gdpr/delete-request', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    const tenantId = app.resolveTenantId(request);

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: auth.userId,
          action: 'GDPR_DELETE_REQUESTED',
          entity: 'User',
          entityId: auth.userId,
        },
      });
      return { status: 'queued' };
    });
  });
}
