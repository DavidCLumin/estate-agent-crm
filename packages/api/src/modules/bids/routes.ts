import type { FastifyInstance } from 'fastify';
import { BidInputSchema } from '@estate/shared';
import { z } from 'zod';
import { withRequestContext } from '../../lib/context';
import { requireRole } from '../../lib/rbac';
import { AppError } from '../../lib/errors';
import { buildBidHash } from '../../lib/security';
import { env } from '../../lib/env';
import { logAudit } from '../audit/service';
import { validateBidSubmission } from './rules';

const IdParam = z.object({ id: z.string().uuid() });

function maskedLabel(userId: string, map: Map<string, string>) {
  if (!map.has(userId)) map.set(userId, `Bidder ${String.fromCharCode(65 + map.size)}`);
  return map.get(userId)!;
}

export async function bidRoutes(app: FastifyInstance) {
  app.post(
    '/properties/:id/bids',
    {
      preHandler: app.authenticate,
      config: {
        rateLimit: {
          max: env.BID_RATE_LIMIT_MAX,
          timeWindow: env.BID_RATE_LIMIT_WINDOW,
        },
      },
    },
    async (request, reply) => {
    const auth = request.auth!;
    requireRole(auth.role, ['BUYER']);

    const { id: propertyId } = IdParam.parse(request.params);
    const { amount } = BidInputSchema.parse(request.body);
    const tenantId = app.resolveTenantId(request)!;

    const bid = await withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const property = await tx.property.findFirst({ where: { id: propertyId, tenantId, deletedAt: null } });
      if (!property) throw new AppError(404, 'Property not found');
      if (property.status !== 'LIVE') throw new AppError(409, 'Property is not live for bidding');

      const latestBid = await tx.bid.findFirst({ where: { propertyId }, orderBy: { amount: 'desc' } });
      validateBidSubmission({ property, latestBid, amount, now: new Date() });

      const createdAt = new Date();
      const bidHash = buildBidHash({
        tenantId,
        propertyId,
        buyerUserId: auth.userId,
        amount: amount.toString(),
        createdAtIso: createdAt.toISOString(),
        secret: env.BID_HASH_SECRET,
      });

      const created = await tx.bid.create({
        data: {
          tenantId,
          propertyId,
          buyerUserId: auth.userId,
          amount,
          bidHash,
          createdAt,
        },
      });

      await logAudit(tx, {
        tenantId,
        userId: auth.userId,
        action: 'BID_SUBMITTED',
        entity: 'Bid',
        entityId: created.id,
        metadata: { propertyId, amount },
      });

      return created;
    });

    return reply.code(201).send(bid);
    },
  );

  app.get('/properties/:id/bids', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    const { id: propertyId } = IdParam.parse(request.params);
    const tenantId = app.resolveTenantId(request)!;

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const property = await tx.property.findUnique({ where: { id: propertyId } });
      if (!property) throw new AppError(404, 'Property not found');
      if (property.tenantId !== tenantId || property.deletedAt) throw new AppError(404, 'Property not found');
      if (auth.role === 'BUYER' && property.status !== 'LIVE') throw new AppError(404, 'Property not found');

      const bids = await tx.bid.findMany({
        where: auth.role === 'BUYER' ? { propertyId, buyerUserId: auth.userId } : { propertyId },
        orderBy: { createdAt: 'desc' },
        include: { buyer: { select: { id: true, name: true } } },
      });

      if (auth.role === 'BUYER' && property.biddingMode === 'OPEN') {
        const all = await tx.bid.findMany({ where: { propertyId }, orderBy: { createdAt: 'asc' } });
        const map = new Map<string, string>();
        const history = all.map((b) => ({ amount: b.amount, createdAt: b.createdAt, bidder: maskedLabel(b.buyerUserId, map) }));
        const highest = all.reduce((max, current) => (Number(current.amount) > Number(max.amount) ? current : max), all[0]);
        return { ownBids: bids, highestBid: highest?.amount ?? null, bidHistory: history };
      }

      return bids;
    });
  });

  app.post('/properties/:id/close-bidding', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN', 'AGENT']);
    const { id: propertyId } = IdParam.parse(request.params);
    const tenantId = app.resolveTenantId(request)!;

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const existing = await tx.property.findFirst({
        where: { id: propertyId, tenantId, deletedAt: null },
      });
      if (!existing) throw new AppError(404, 'Property not found');
      const property = await tx.property.update({
        where: { id: propertyId },
        data: { biddingDeadline: new Date(), status: 'UNDER_OFFER' },
      });
      await logAudit(tx, {
        tenantId,
        userId: auth.userId,
        action: 'BIDDING_CLOSED',
        entity: 'Property',
        entityId: propertyId,
      });
      return property;
    });
  });

  app.post('/properties/:id/accept-offer/:bidId', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN', 'AGENT']);
    const params = z.object({ id: z.string().uuid(), bidId: z.string().uuid() }).parse(request.params);
    const tenantId = app.resolveTenantId(request)!;

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const property = await tx.property.findUnique({ where: { id: params.id } });
      if (!property || property.tenantId !== tenantId || property.deletedAt) throw new AppError(404, 'Property not found');
      if (property.status !== 'LIVE' && property.status !== 'UNDER_OFFER') {
        throw new AppError(409, 'Offer can only be accepted on active listings');
      }

      const bid = await tx.bid.findFirst({
        where: { id: params.bidId, propertyId: params.id },
      });
      if (!bid) throw new AppError(404, 'Bid not found');

      const updated = await tx.property.update({
        where: { id: params.id },
        data: { status: 'UNDER_OFFER', biddingDeadline: new Date() },
      });

      await logAudit(tx, {
        tenantId,
        userId: auth.userId,
        action: 'OFFER_ACCEPTED',
        entity: 'Bid',
        entityId: bid.id,
        metadata: {
          propertyId: params.id,
          amount: bid.amount,
        },
      });

      return { property: updated, acceptedBidId: bid.id };
    });
  });
}
