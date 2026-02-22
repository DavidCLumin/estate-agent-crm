import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../lib/errors';

export default fp(async function tenantPlugin(app: FastifyInstance) {
  app.decorate('resolveTenantId', (request: any) => {
    if (request.auth?.role === 'SUPER_ADMIN') return request.headers['x-tenant-id'] ?? null;
    const headerTenant = request.headers['x-tenant-id'];
    if (headerTenant && request.auth?.tenantId && headerTenant !== request.auth.tenantId) {
      throw new AppError(403, 'Tenant header mismatch', 'TENANT_MISMATCH');
    }
    return request.auth?.tenantId ?? headerTenant ?? null;
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    resolveTenantId: (request: any) => string | null;
  }
}
