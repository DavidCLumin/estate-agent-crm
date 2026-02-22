import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@estate/db';
import { withRequestContext } from '../../lib/context';
import { requireRole } from '../../lib/rbac';
import { logAudit } from '../audit/service';
import { AppError } from '../../lib/errors';

const BrandingSchema = z.object({
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().min(4),
  secondaryColor: z.string().min(4),
  neutralPalette: z.record(z.string()),
  cornerRadius: z.number().int().min(0).max(32),
  spacingScale: z.record(z.number()),
});

const TenantSettingsSchema = z.object({
  testModeEnabled: z.boolean().default(false),
  emailTemplates: z
    .object({
      viewingRequestSubject: z.string().min(1).max(160).optional(),
      viewingApprovedSubject: z.string().min(1).max(160).optional(),
      offerReceivedSubject: z.string().min(1).max(160).optional(),
    })
    .optional(),
});

function parseTenantSettings(value: unknown) {
  if (!value || typeof value !== 'object') {
    return {
      testModeEnabled: false,
      emailTemplates: {},
    };
  }

  const parsed = value as Record<string, unknown>;
  return {
    testModeEnabled: parsed.testModeEnabled === true,
    emailTemplates:
      parsed.emailTemplates && typeof parsed.emailTemplates === 'object'
        ? (parsed.emailTemplates as Record<string, string>)
        : {},
  };
}

export async function tenantRoutes(app: FastifyInstance) {
  app.get('/tenants/branding', async (request) => {
    const tenantKey = z.string().min(2).parse((request.query as any)?.tenantKey);
    return prisma.tenant.findUnique({ where: { key: tenantKey }, select: { logoUrl: true, primaryColor: true, secondaryColor: true, neutralPalette: true, cornerRadius: true, spacingScale: true, name: true, key: true } });
  });

  app.put('/tenants/branding', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN']);
    const tenantId = app.resolveTenantId(request)!;
    const body = BrandingSchema.parse(request.body);

    return withRequestContext({ tenantId, role: auth.role }, (tx) =>
      tx.tenant.update({
        where: { id: tenantId },
        data: {
          logoUrl: body.logoUrl,
          primaryColor: body.primaryColor,
          secondaryColor: body.secondaryColor,
          neutralPalette: body.neutralPalette,
          cornerRadius: body.cornerRadius,
          spacingScale: body.spacingScale,
        },
      }),
    );
  });

  app.get('/tenants/settings', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN', 'AGENT']);
    const tenantId = app.resolveTenantId(request)!;

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const tenant = await tx.tenant.findFirst({
        where: { id: tenantId, deletedAt: null },
        select: { id: true, key: true, name: true, emailProviderMeta: true },
      });
      if (!tenant) throw new AppError(404, 'Tenant not found');

      return {
        tenantId: tenant.id,
        tenantKey: tenant.key,
        tenantName: tenant.name,
        ...parseTenantSettings(tenant.emailProviderMeta),
      };
    });
  });

  app.put('/tenants/settings', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN']);
    const tenantId = app.resolveTenantId(request)!;
    const body = TenantSettingsSchema.parse(request.body);

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const tenant = await tx.tenant.findFirst({
        where: { id: tenantId, deletedAt: null },
        select: { id: true, emailProviderMeta: true },
      });
      if (!tenant) throw new AppError(404, 'Tenant not found');

      const existing = parseTenantSettings(tenant.emailProviderMeta);
      const next = {
        ...existing,
        testModeEnabled: body.testModeEnabled,
        emailTemplates: {
          ...existing.emailTemplates,
          ...(body.emailTemplates ?? {}),
        },
      };

      const updated = await tx.tenant.update({
        where: { id: tenant.id },
        data: { emailProviderMeta: next },
        select: { id: true, key: true, name: true, emailProviderMeta: true },
      });

      await logAudit(tx, {
        tenantId,
        userId: auth.userId,
        action: 'TENANT_SETTINGS_UPDATED',
        entity: 'Tenant',
        entityId: tenant.id,
      });

      return {
        tenantId: updated.id,
        tenantKey: updated.key,
        tenantName: updated.name,
        ...parseTenantSettings(updated.emailProviderMeta),
      };
    });
  });

  app.get('/super/tenants', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['SUPER_ADMIN']);
    return prisma.tenant.findMany({ include: { _count: { select: { users: true, properties: true, bids: true } } } });
  });

  app.post('/super/tenants', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = request.auth!;
    requireRole(auth.role, ['SUPER_ADMIN']);
    const body = z.object({ name: z.string(), key: z.string() }).parse(request.body);
    const tenant = await prisma.tenant.create({
      data: {
        name: body.name,
        key: body.key,
        neutralPalette: { bg: '#F5F7FA', text: '#0A0A0A' },
        spacingScale: { base: 8 },
      },
    });
    return reply.code(201).send(tenant);
  });

  app.post('/super/impersonate/:userId', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['SUPER_ADMIN']);
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params);

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.role !== 'TENANT_ADMIN' || !target.tenantId) {
      throw new AppError(400, 'Target must be a tenant admin');
    }

    const token = app.jwt.sign(
      {
        sub: target.id,
        tenantId: target.tenantId,
        role: target.role,
        sessionId: `impersonation-${Date.now()}`,
        email: target.email,
      },
      { expiresIn: '10m' },
    );

    await withRequestContext({ tenantId: null, role: auth.role }, (tx) =>
      logAudit(tx, {
        tenantId: target.tenantId,
        userId: auth.userId,
        action: 'SUPER_ADMIN_IMPERSONATION',
        entity: 'User',
        entityId: target.id,
        metadata: { by: auth.email },
      }),
    );

    return { accessToken: token };
  });
}
