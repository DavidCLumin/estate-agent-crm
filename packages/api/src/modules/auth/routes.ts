import type { FastifyInstance } from 'fastify';
import { RegisterSchema, LoginSchema } from '@estate/shared';
import { z } from 'zod';
import { prisma } from '@estate/db';
import { AppError } from '../../lib/errors';
import { hashPassword, verifyPassword, hashRefreshToken, MAX_LOGIN_ATTEMPTS, LOCKOUT_MINUTES } from '../../lib/security';
import { logAudit } from '../audit/service';
import { withRequestContext } from '../../lib/context';
import { env } from '../../lib/env';
import { sendEmail } from '../../lib/notifications';

const RefreshSchema = z.object({ refreshToken: z.string().min(20) });
const VerifyEmailSchema = z.object({ email: z.string().email(), code: z.string().min(6) });
const PhoneRequestSchema = z.object({ phone: z.string().min(6).max(30) });
const PhoneVerifySchema = z.object({ phone: z.string().min(6).max(30), code: z.string().min(4).max(10) });

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (request, reply) => {
    const body = RegisterSchema.parse(request.body);

    const tenant = await prisma.tenant.findUnique({ where: { id: body.tenantId } });
    if (!tenant) throw new AppError(404, 'Tenant not found');

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new AppError(409, 'Email already exists');

    const code = Math.floor(Math.random() * 900000 + 100000).toString();
    const user = await prisma.user.create({
      data: {
        tenantId: body.tenantId,
        email: body.email,
        name: body.name,
        passwordHash: await hashPassword(body.password),
        role: body.role,
        emailVerificationCode: code,
      },
    });

    await sendEmail({
      to: body.email,
      subject: 'Verify your Estate CRM account',
      text: `Your verification code is ${code}`,
    });

    return reply.code(201).send({ id: user.id, message: 'Registered. Verify email to login.' });
  });

  app.post('/auth/verify-email', async (request, reply) => {
    const body = VerifyEmailSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });

    if (!user || user.emailVerificationCode !== body.code) {
      throw new AppError(400, 'Invalid verification code');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date(), emailVerificationCode: null },
    });

    return reply.send({ message: 'Email verified' });
  });

  app.post('/auth/phone/request', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    const body = PhoneRequestSchema.parse(request.body);
    const tenantId = app.resolveTenantId(request)!;
    const code = '000000';

    await withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      await logAudit(tx, {
        tenantId,
        userId: auth.userId,
        action: 'PHONE_VERIFICATION_CODE_REQUESTED',
        entity: 'User',
        entityId: auth.userId,
        metadata: { phone: body.phone, codeHint: 'stub-only' },
        ipAddress: request.ip,
      });
    });

    await sendEmail({
      to: auth.email,
      subject: 'Phone verification code (beta stub)',
      text: `Your phone verification code is ${code}. This beta uses stub verification.`,
    });

    return { message: 'Verification code sent (stub mode).' };
  });

  app.post('/auth/phone/verify', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    const body = PhoneVerifySchema.parse(request.body);
    const tenantId = app.resolveTenantId(request)!;
    const accepted = body.code === '000000';

    await withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      await logAudit(tx, {
        tenantId,
        userId: auth.userId,
        action: accepted ? 'PHONE_VERIFIED_STUB' : 'PHONE_VERIFICATION_FAILED_STUB',
        entity: 'User',
        entityId: auth.userId,
        metadata: { phone: body.phone },
        ipAddress: request.ip,
      });
    });

    if (!accepted) {
      throw new AppError(400, 'Invalid verification code');
    }

    return { message: 'Phone verification recorded (stub)' };
  });

  app.post(
    '/auth/login',
    {
      config: {
        rateLimit: {
          max: env.LOGIN_RATE_LIMIT_MAX,
          timeWindow: env.LOGIN_RATE_LIMIT_WINDOW,
        },
      },
    },
    async (request, reply) => {
    const body = LoginSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || user.deletedAt) throw new AppError(401, 'Invalid credentials');
    if (!user.emailVerifiedAt) throw new AppError(403, 'Email not verified');

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(423, 'Account temporarily locked');
    }

    if (body.tenantId && user.tenantId !== body.tenantId) {
      throw new AppError(403, 'Tenant mismatch');
    }

    const valid = await verifyPassword(user.passwordHash, body.password);
    if (!valid) {
      const failed = user.failedLoginCount + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed,
          lockedUntil: failed >= MAX_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60000) : null,
        },
      });
      throw new AppError(401, 'Invalid credentials');
    }

    const session = await prisma.userSession.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        refreshTokenHash: 'pending',
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      },
    });

    const accessToken = app.jwt.sign(
      {
        sub: user.id,
        tenantId: user.tenantId,
        role: user.role,
        sessionId: session.id,
        email: user.email,
      },
      { expiresIn: '15m' },
    );

    const refreshToken = app.jwt.sign(
      {
        sub: user.id,
        tenantId: user.tenantId,
        role: user.role,
        sessionId: session.id,
        email: user.email,
      },
      { expiresIn: '30d' },
    );

    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    await prisma.userSession.update({ where: { id: session.id }, data: { refreshTokenHash: hashRefreshToken(refreshToken), tenantId: user.tenantId } });

    await withRequestContext({ tenantId: user.tenantId, role: user.role }, async (tx) => {
      await logAudit(tx, {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'AUTH_LOGIN',
        entity: 'User',
        entityId: user.id,
        ipAddress: request.ip,
      });
    });

    return reply.send({ accessToken, refreshToken, user: { id: user.id, role: user.role, tenantId: user.tenantId, name: user.name, email: user.email } });
    },
  );

  app.post('/auth/refresh', async (request, reply) => {
    const { refreshToken } = RefreshSchema.parse(request.body);
    let payload: any;

    try {
      payload = app.jwt.verify(refreshToken);
    } catch {
      throw new AppError(401, 'Invalid refresh token');
    }

    const session = await prisma.userSession.findUnique({ where: { id: payload.sessionId }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) throw new AppError(401, 'Session expired');
    if (session.refreshTokenHash !== hashRefreshToken(refreshToken)) throw new AppError(401, 'Refresh token revoked');

    const rotatedRefresh = app.jwt.sign(
      {
        sub: session.user.id,
        tenantId: session.user.tenantId,
        role: session.user.role,
        sessionId: session.id,
        email: session.user.email,
      },
      { expiresIn: '30d' },
    );

    await prisma.userSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: hashRefreshToken(rotatedRefresh),
      },
    });

    const accessToken = app.jwt.sign(
      {
        sub: session.user.id,
        tenantId: session.user.tenantId,
        role: session.user.role,
        sessionId: session.id,
        email: session.user.email,
      },
      { expiresIn: '15m' },
    );

    return reply.send({ accessToken, refreshToken: rotatedRefresh });
  });
}
