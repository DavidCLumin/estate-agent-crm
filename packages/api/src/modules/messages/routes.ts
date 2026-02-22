import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withRequestContext } from '../../lib/context';
import { AppError } from '../../lib/errors';

const PropertyParam = z.object({ propertyId: z.string().uuid() });
const MessageBody = z.object({ body: z.string().min(1).max(2000) });
const MessageIdParam = z.object({ id: z.string().uuid() });

export async function messageRoutes(app: FastifyInstance) {
  app.get('/messages/threads', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    const tenantId = app.resolveTenantId(request)!;

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const rows = await tx.message.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
          property: {
            select: { id: true, address: true },
          },
          sender: { select: { id: true, name: true } },
        },
      });

      const threads = new Map<
        string,
        {
          propertyId: string;
          propertyAddress: string;
          agentName: string | null;
          lastMessage: { id: string; body: string; createdAt: Date; senderId: string; readAt: Date | null };
          unreadCount: number;
          messageCount: number;
        }
      >();

      for (const row of rows) {
        const existing = threads.get(row.propertyId);
        const isUnreadForCurrentUser = row.readAt === null && row.senderId !== auth.userId;

        if (!existing) {
          threads.set(row.propertyId, {
            propertyId: row.propertyId,
            propertyAddress: row.property.address,
            agentName: row.senderId === auth.userId ? null : row.sender.name,
            lastMessage: {
              id: row.id,
              body: row.body,
              createdAt: row.createdAt,
              senderId: row.senderId,
              readAt: row.readAt,
            },
            unreadCount: isUnreadForCurrentUser ? 1 : 0,
            messageCount: 1,
          });
          continue;
        }

        if (isUnreadForCurrentUser) existing.unreadCount += 1;
        existing.messageCount += 1;
        if (!existing.agentName && row.senderId !== auth.userId) existing.agentName = row.sender.name;
      }

      return Array.from(threads.values())
        .map((thread) => ({ ...thread, agentName: thread.agentName ?? 'Agent' }))
        .sort(
        (a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime(),
      );
    });
  });

  app.get('/properties/:propertyId/messages', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    const { propertyId } = PropertyParam.parse(request.params);
    const tenantId = app.resolveTenantId(request)!;

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const property = await tx.property.findUnique({ where: { id: propertyId } });
      if (!property) throw new AppError(404, 'Property not found');
      return tx.message.findMany({ where: { propertyId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    });
  });

  app.post('/properties/:propertyId/messages', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = request.auth!;
    const { propertyId } = PropertyParam.parse(request.params);
    const { body } = MessageBody.parse(request.body);
    const tenantId = app.resolveTenantId(request)!;

    const created = await withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const property = await tx.property.findUnique({ where: { id: propertyId } });
      if (!property) throw new AppError(404, 'Property not found');
      return tx.message.create({ data: { tenantId, propertyId, senderId: auth.userId, body } });
    });

    return reply.code(201).send(created);
  });

  app.post('/messages/:id/read', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    const { id } = MessageIdParam.parse(request.params);
    const tenantId = app.resolveTenantId(request)!;

    return withRequestContext({ tenantId, role: auth.role }, (tx) => tx.message.update({ where: { id }, data: { readAt: new Date() } }));
  });
}
