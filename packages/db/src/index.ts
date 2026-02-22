import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function withTenantContext<T>(
  tenantId: string | null,
  role: string,
  fn: (tx: PrismaClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    if (tenantId) {
      await tx.$executeRawUnsafe(`SELECT set_config('app.tenant_id', $1, true)`, tenantId);
    }
    await tx.$executeRawUnsafe(`SELECT set_config('app.role', $1, true)`, role);
    return fn(tx as PrismaClient);
  });
}
