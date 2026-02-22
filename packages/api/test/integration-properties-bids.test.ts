import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@estate/db';
import { buildApp } from '../src/app';

type LoginResult = { accessToken: string; user: { role: string } };
type PropertyResult = { id: string; status: string; minimumOffer?: number | null };

async function login(app: FastifyInstance, email: string, password: string): Promise<LoginResult> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  return res.json();
}

async function createLiveProperty(app: FastifyInstance, token: string, minimumOffer = 700000): Promise<PropertyResult> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const res = await app.inject({
    method: 'POST',
    url: '/properties',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      title: `Integration QA ${suffix}`,
      address: `21 QA Street ${suffix}`,
      description: 'Integration flow test listing',
      priceGuide: 800000,
      minimumOffer,
      status: 'LIVE',
      biddingMode: 'OPEN',
      minIncrement: 1000,
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json();
}

let dbAvailable = true;
try {
  await prisma.$queryRaw`SELECT 1`;
} catch {
  dbAvailable = false;
}

const integrationDescribe = dbAvailable ? describe : describe.skip;

integrationDescribe('integration: bids + lifecycle + role guards', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('enforces minimum-offer and highest-bid rules via POST /properties/:id/bids', async () => {
    const agent = await login(app, 'agent@acme.local', 'Passw0rd!');
    const buyer = await login(app, 'buyer@acme.local', 'Passw0rd!');
    const property = await createLiveProperty(app, agent.accessToken, 700000);

    const belowMin = await app.inject({
      method: 'POST',
      url: `/properties/${property.id}/bids`,
      headers: { authorization: `Bearer ${buyer.accessToken}` },
      payload: { amount: 699999 },
    });
    expect(belowMin.statusCode).toBe(409);

    const firstValid = await app.inject({
      method: 'POST',
      url: `/properties/${property.id}/bids`,
      headers: { authorization: `Bearer ${buyer.accessToken}` },
      payload: { amount: 700000 },
    });
    expect(firstValid.statusCode).toBe(201);

    const notHigher = await app.inject({
      method: 'POST',
      url: `/properties/${property.id}/bids`,
      headers: { authorization: `Bearer ${buyer.accessToken}` },
      payload: { amount: 700000 },
    });
    expect(notHigher.statusCode).toBe(409);
  });

  it('hides minimumOffer from buyer listing payload', async () => {
    const agent = await login(app, 'agent@acme.local', 'Passw0rd!');
    const buyer = await login(app, 'buyer@acme.local', 'Passw0rd!');
    const property = await createLiveProperty(app, agent.accessToken, 710000);

    const buyerList = await app.inject({
      method: 'GET',
      url: '/properties',
      headers: { authorization: `Bearer ${buyer.accessToken}` },
    });
    expect(buyerList.statusCode).toBe(200);
    const rows = buyerList.json() as Array<Record<string, unknown>>;
    const found = rows.find((x) => x.id === property.id);
    expect(found).toBeTruthy();
    expect(found && Object.prototype.hasOwnProperty.call(found, 'minimumOffer')).toBe(false);
  });

  it('enforces lifecycle transitions and role guards for PUT/DELETE /properties/:id', async () => {
    const admin = await login(app, 'admin@acme.local', 'Passw0rd!');
    const agent = await login(app, 'agent@acme.local', 'Passw0rd!');
    const buyer = await login(app, 'buyer@acme.local', 'Passw0rd!');
    const property = await createLiveProperty(app, agent.accessToken, 700000);

    const buyerCannotUpdate = await app.inject({
      method: 'PUT',
      url: `/properties/${property.id}`,
      headers: { authorization: `Bearer ${buyer.accessToken}` },
      payload: { status: 'UNDER_OFFER' },
    });
    expect(buyerCannotUpdate.statusCode).toBe(403);

    const invalidTransition = await app.inject({
      method: 'PUT',
      url: `/properties/${property.id}`,
      headers: { authorization: `Bearer ${agent.accessToken}` },
      payload: { status: 'SOLD' },
    });
    expect(invalidTransition.statusCode).toBe(409);

    const liveToUnderOffer = await app.inject({
      method: 'PUT',
      url: `/properties/${property.id}`,
      headers: { authorization: `Bearer ${agent.accessToken}` },
      payload: { status: 'UNDER_OFFER' },
    });
    expect(liveToUnderOffer.statusCode).toBe(200);

    const underOfferToSold = await app.inject({
      method: 'PUT',
      url: `/properties/${property.id}`,
      headers: { authorization: `Bearer ${agent.accessToken}` },
      payload: { status: 'SOLD' },
    });
    expect(underOfferToSold.statusCode).toBe(200);

    const agentCannotDelete = await app.inject({
      method: 'DELETE',
      url: `/properties/${property.id}`,
      headers: { authorization: `Bearer ${agent.accessToken}` },
    });
    expect(agentCannotDelete.statusCode).toBe(403);

    const adminCanDelete = await app.inject({
      method: 'DELETE',
      url: `/properties/${property.id}`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    expect(adminCanDelete.statusCode).toBe(200);
  });

  it('enforces role guards for close-bidding + accept-offer endpoints', async () => {
    const agent = await login(app, 'agent@acme.local', 'Passw0rd!');
    const buyer = await login(app, 'buyer@acme.local', 'Passw0rd!');
    const property = await createLiveProperty(app, agent.accessToken, 650000);

    const buyerBid = await app.inject({
      method: 'POST',
      url: `/properties/${property.id}/bids`,
      headers: { authorization: `Bearer ${buyer.accessToken}` },
      payload: { amount: 700000 },
    });
    expect(buyerBid.statusCode).toBe(201);
    const bidId = (buyerBid.json() as { id: string }).id;

    const buyerCloseDenied = await app.inject({
      method: 'POST',
      url: `/properties/${property.id}/close-bidding`,
      headers: { authorization: `Bearer ${buyer.accessToken}` },
    });
    expect(buyerCloseDenied.statusCode).toBe(403);

    const agentCloseOk = await app.inject({
      method: 'POST',
      url: `/properties/${property.id}/close-bidding`,
      headers: { authorization: `Bearer ${agent.accessToken}` },
    });
    expect(agentCloseOk.statusCode).toBe(200);

    const buyerAcceptDenied = await app.inject({
      method: 'POST',
      url: `/properties/${property.id}/accept-offer/${bidId}`,
      headers: { authorization: `Bearer ${buyer.accessToken}` },
    });
    expect(buyerAcceptDenied.statusCode).toBe(403);

    const agentAcceptOk = await app.inject({
      method: 'POST',
      url: `/properties/${property.id}/accept-offer/${bidId}`,
      headers: { authorization: `Bearer ${agent.accessToken}` },
    });
    expect(agentAcceptOk.statusCode).toBe(200);
  });
});
