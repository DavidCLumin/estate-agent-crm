import type { PrismaClient } from '@prisma/client';

type LogArgs = {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: unknown;
  ipAddress?: string;
};

export async function logAudit(tx: PrismaClient, args: LogArgs) {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId ?? null,
      userId: args.userId ?? null,
      action: args.action,
      entity: args.entity,
      entityId: args.entityId,
      metadata: args.metadata as any,
      ipAddress: args.ipAddress,
    },
  });
}
