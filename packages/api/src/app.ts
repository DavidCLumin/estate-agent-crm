import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import authPlugin from './plugins/auth';
import tenantPlugin from './plugins/tenant';
import { registerRoutes } from './routes';
import { env } from './lib/env';
import { ZodError } from 'zod';
import { AppError } from './lib/errors';
import { prisma } from '@estate/db';

export function buildApp() {
  const app = Fastify({
    trustProxy: env.TRUST_PROXY,
    logger: {
      level: env.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
  });

  app.register(sensible);
  app.register(helmet, { contentSecurityPolicy: false });
  app.register(cors, {
    origin: env.CORS_ORIGIN.split(','),
    credentials: true,
  });
  app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });

  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch (error) {
      app.log.error({ error }, 'Readiness check failed');
      return reply.status(503).send({ status: 'error' });
    }
  });

  app.register(authPlugin);
  app.register(tenantPlugin);
  app.register(async (instance) => {
    await registerRoutes(instance);
  });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        message: 'Validation error',
        issues: err.flatten(),
        requestId: request.id,
      });
    }
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        message: err.message,
        code: err.code,
        requestId: request.id,
      });
    }
    app.log.error({ err, requestId: request.id, path: request.url }, 'Unhandled error');
    return reply.status(500).send({ message: 'Internal server error', requestId: request.id });
  });

  return app;
}
