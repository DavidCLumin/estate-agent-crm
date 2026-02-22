import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import { env } from '../lib/env';
import type { AuthPayload } from '../types';

export default fp(async function authPlugin(app: FastifyInstance) {
  await app.register(jwt, {
    secret: env.JWT_ACCESS_SECRET,
  });

  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      const payload = (await request.jwtVerify()) as AuthPayload;
      request.auth = {
        userId: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
        sessionId: payload.sessionId,
        email: payload.email,
      };
    } catch {
      reply.code(401).send({ message: 'Unauthorized' });
    }
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
  }
}
