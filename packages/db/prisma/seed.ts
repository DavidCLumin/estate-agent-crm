import { PrismaClient, Role, BiddingMode, PropertyStatus, AppointmentStatus } from '@prisma/client';
import argon2 from 'argon2';
import crypto from 'node:crypto';

const prisma = new PrismaClient();
const bidSecret = process.env.BID_HASH_SECRET ?? 'dev_bid_secret';

function hashBid(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.leadNote.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.message.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.propertyMedia.deleteMany();
  await prisma.property.deleteMany();
  await prisma.userSession.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  const tenant = await prisma.tenant.create({
    data: {
      name: 'Acme Estates',
      key: 'acme',
      logoUrl: 'https://placehold.co/120x120',
      primaryColor: '#1E6BFF',
      secondaryColor: '#30B07A',
      neutralPalette: { bg: '#F5F7FA', text: '#0A0A0A' },
      cornerRadius: 14,
      spacingScale: { base: 8 },
      subdomain: 'acme',
      customDomain: null,
      emailSenderName: 'Acme Estates',
      emailSenderAddress: 'no-reply@acme.local',
      emailProvider: 'stub',
      emailProviderMeta: {},
    },
  });

  const superAdmin = await prisma.user.create({
    data: {
      tenantId: null,
      name: 'Platform Admin',
      email: 'super@estate.local',
      passwordHash: await argon2.hash('Passw0rd!'),
      role: Role.SUPER_ADMIN,
      emailVerifiedAt: new Date(),
    },
  });

  const tenantAdmin = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      name: 'Tenant Admin',
      email: 'admin@acme.local',
      passwordHash: await argon2.hash('Passw0rd!'),
      role: Role.TENANT_ADMIN,
      emailVerifiedAt: new Date(),
    },
  });

  const agent = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      name: 'Alice Agent',
      email: 'agent@acme.local',
      passwordHash: await argon2.hash('Passw0rd!'),
      role: Role.AGENT,
      emailVerifiedAt: new Date(),
    },
  });

  const buyer = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      name: 'Ben Buyer',
      email: 'buyer@acme.local',
      passwordHash: await argon2.hash('Passw0rd!'),
      role: Role.BUYER,
      emailVerifiedAt: new Date(),
    },
  });

  const property = await prisma.property.create({
    data: {
      tenantId: tenant.id,
      title: '3 Bed Detached Home',
      address: '12 Seaview Drive, Dublin',
      eircode: 'D01TEST',
      description: 'Modern detached home close to schools and transport.',
      priceGuide: 450000,
      minimumOffer: 420000,
      status: PropertyStatus.LIVE,
      biddingMode: BiddingMode.OPEN,
      biddingDeadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      minIncrement: 2000,
      createdById: tenantAdmin.id,
      assignedAgentId: agent.id,
      media: {
        create: [
          { tenantId: tenant.id, url: 'https://placehold.co/1200x800?text=Front' },
          { tenantId: tenant.id, url: 'https://placehold.co/1200x800?text=Living' },
        ],
      },
    },
  });

  const createdAt = new Date();
  await prisma.bid.create({
    data: {
      tenantId: tenant.id,
      propertyId: property.id,
      buyerUserId: buyer.id,
      amount: 452000,
      createdAt,
      bidHash: hashBid(`${tenant.id}:${property.id}:${buyer.id}:452000:${createdAt.toISOString()}:${bidSecret}`),
    },
  });

  await prisma.appointment.create({
    data: {
      tenantId: tenant.id,
      propertyId: property.id,
      buyerId: buyer.id,
      agentId: agent.id,
      preferredStart: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2),
      preferredEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2 + 1000 * 60 * 30),
      status: AppointmentStatus.REQUESTED,
      note: 'Evening preferred',
    },
  });

  await prisma.message.createMany({
    data: [
      {
        tenantId: tenant.id,
        propertyId: property.id,
        senderId: buyer.id,
        body: 'Is there parking available?',
      },
      {
        tenantId: tenant.id,
        propertyId: property.id,
        senderId: agent.id,
        body: 'Yes, two off-street spaces are included.',
      },
    ],
  });

  const lead = await prisma.lead.create({
    data: {
      tenantId: tenant.id,
      firstName: 'Nora',
      lastName: 'Nolan',
      email: 'nora.nolan@example.com',
      phone: '+353871234567',
      source: 'Website Form',
      budgetMin: 420000,
      budgetMax: 510000,
      status: 'CONTACTED',
      assignedAgentId: agent.id,
      createdById: tenantAdmin.id,
      propertyId: property.id,
      nextFollowUpAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    },
  });

  await prisma.leadNote.create({
    data: {
      tenantId: tenant.id,
      leadId: lead.id,
      userId: agent.id,
      body: 'Initial call completed. Buyer interested in school catchment area and parking.',
    },
  });

  await prisma.reminder.create({
    data: {
      tenantId: tenant.id,
      userId: agent.id,
      leadId: lead.id,
      propertyId: property.id,
      title: 'Follow up with Nora Nolan',
      body: 'Send brochure and confirm weekend viewing availability.',
      dueAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      channel: 'IN_APP',
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        tenantId: tenant.id,
        userId: tenantAdmin.id,
        action: 'SEED_CREATED_PROPERTY',
        entity: 'Property',
        entityId: property.id,
        metadata: { source: 'seed' },
      },
      {
        tenantId: tenant.id,
        userId: buyer.id,
        action: 'SEED_SUBMITTED_BID',
        entity: 'Bid',
        metadata: { amount: 452000 },
      },
      {
        tenantId: null,
        userId: superAdmin.id,
        action: 'SEED_PLATFORM_BOOTSTRAP',
        entity: 'Platform',
      },
    ],
  });

  console.log('Seed complete');
  console.log({ tenantKey: tenant.key, tenantId: tenant.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
