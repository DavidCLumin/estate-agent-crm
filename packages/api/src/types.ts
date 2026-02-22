import type { Role } from '@prisma/client';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      userId: string;
      tenantId: string | null;
      role: Role;
      sessionId: string;
      email: string;
    };
  }
}

export type AuthPayload = {
  sub: string;
  tenantId: string | null;
  role: Role;
  sessionId: string;
  email: string;
};
