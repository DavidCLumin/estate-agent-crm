import { prisma } from '@estate/db';
import type { PrismaClient } from '@prisma/client';

export async function withRequestContext<T>(
  args: { tenantId: string | null; role: string },
  fn: (tx: PrismaClient) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    if (args.tenantId) {
      await tx.$executeRawUnsafe(`SELECT set_config('app.tenant_id', $1, true)`, args.tenantId);
    }
    await tx.$executeRawUnsafe(`SELECT set_config('app.role', $1, true)`, args.role);
    return fn(tx as unknown as PrismaClient);
  });
}
