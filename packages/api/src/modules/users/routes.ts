import { randomUUID } from 'node:crypto';
import { basename, extname, join, resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withRequestContext } from '../../lib/context';
import { requireRole } from '../../lib/rbac';
import { AppError } from '../../lib/errors';
import { hashPassword } from '../../lib/security';
import { logAudit } from '../audit/service';

const UPLOAD_ROOT = resolve(process.cwd(), 'uploads', 'buyer-documents');
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const BuyerDocumentTypeEnum = z.enum([
  'PROOF_OF_FUNDS',
  'MORTGAGE_APPROVAL',
  'PROOF_OF_IDENTITY',
  'PROOF_OF_ADDRESS',
  'SOURCE_OF_FUNDS',
  'SOLICITOR_DETAILS',
  'OTHER',
]);

const BuyerIdParam = z.object({ buyerId: z.string().uuid() });
const DocumentIdParam = z.object({ id: z.string().uuid() });
const UserIdParam = z.object({ id: z.string().uuid() });
const StaffUserQuery = z.object({
  role: z.enum(['TENANT_ADMIN', 'AGENT', 'BUYER']).optional(),
  includeInactive: z.coerce.boolean().optional().default(false),
});
const CreateUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  role: z.enum(['TENANT_ADMIN', 'AGENT', 'BUYER']),
  password: z.string().min(8).max(120),
});
const UpdateUserSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  role: z.enum(['TENANT_ADMIN', 'AGENT', 'BUYER']).optional(),
  active: z.boolean().optional(),
});

const UploadBuyerDocumentBody = z.object({
  documentType: BuyerDocumentTypeEnum,
  documentTitle: z.string().min(2).max(120),
  notes: z.string().max(1000).optional(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  dataBase64: z.string().min(1).max(12_000_000),
});

type BuyerDocumentMetadata = {
  documentType?: string;
  documentTitle?: string;
  notes?: string | null;
  status?: 'SUBMITTED' | 'RECEIVED';
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  filePath?: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

function safeFileName(input: string) {
  const trimmed = basename(input.trim());
  const extension = extname(trimmed);
  const name = trimmed.slice(0, trimmed.length - extension.length);
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'document';
  const safeExt = extension.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10);
  return `${safeName}${safeExt}`;
}

function toMetadata(value: unknown): BuyerDocumentMetadata {
  if (!value || typeof value !== 'object') return {};
  return value as BuyerDocumentMetadata;
}

function serializeDocument(entry: {
  id: string;
  createdAt: Date;
  metadata: unknown;
  userId: string | null;
  user?: { id: string; name: string; email: string } | null;
}) {
  const metadata = toMetadata(entry.metadata);
  return {
    id: entry.id,
    buyerId: entry.userId,
    buyerName: entry.user?.name ?? null,
    buyerEmail: entry.user?.email ?? null,
    createdAt: entry.createdAt,
    documentType: metadata.documentType ?? 'OTHER',
    documentTitle: metadata.documentTitle ?? 'Document',
    notes: metadata.notes ?? null,
    status: metadata.status ?? 'SUBMITTED',
    fileName: metadata.fileName ?? null,
    mimeType: metadata.mimeType ?? null,
    fileSize: metadata.fileSize ?? null,
    hasFile: Boolean(metadata.filePath),
    reviewedAt: metadata.reviewedAt ?? null,
    reviewedBy: metadata.reviewedBy ?? null,
  };
}

export async function userRoutes(app: FastifyInstance) {
  app.get('/me', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    const tenantId = app.resolveTenantId(request);

    return withRequestContext({ tenantId, role: auth.role }, (tx) =>
      tx.user.findUnique({ where: { id: auth.userId }, select: { id: true, email: true, name: true, role: true, tenantId: true } }),
    );
  });

  app.get('/buyers', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN', 'AGENT']);
    const tenantId = app.resolveTenantId(request)!;

    return withRequestContext({ tenantId, role: auth.role }, (tx) =>
      tx.user.findMany({ where: { tenantId, role: 'BUYER', deletedAt: null }, select: { id: true, name: true, email: true, emailVerifiedAt: true, createdAt: true } }),
    );
  });

  app.get('/users', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN', 'SUPER_ADMIN']);
    const query = StaffUserQuery.parse(request.query);
    const tenantId = app.resolveTenantId(request)!;

    return withRequestContext({ tenantId, role: auth.role }, (tx) =>
      tx.user.findMany({
        where: {
          tenantId,
          role: query.role,
          deletedAt: query.includeInactive ? undefined : null,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          emailVerifiedAt: true,
          deletedAt: true,
        },
      }),
    );
  });

  app.post('/users', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN', 'SUPER_ADMIN']);
    const tenantId = app.resolveTenantId(request)!;
    const body = CreateUserSchema.parse(request.body);

    if (auth.role === 'TENANT_ADMIN' && body.role === 'TENANT_ADMIN') {
      throw new AppError(403, 'Tenant admins cannot create additional tenant admins');
    }

    const created = await withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const existing = await tx.user.findUnique({ where: { email: body.email } });
      if (existing) throw new AppError(409, 'Email already exists');

      const user = await tx.user.create({
        data: {
          tenantId,
          name: body.name,
          email: body.email,
          role: body.role,
          passwordHash: await hashPassword(body.password),
          emailVerifiedAt: null,
          emailVerificationCode: Math.floor(Math.random() * 900000 + 100000).toString(),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          deletedAt: true,
          emailVerifiedAt: true,
        },
      });

      await logAudit(tx, {
        tenantId,
        userId: auth.userId,
        action: 'USER_CREATED',
        entity: 'User',
        entityId: user.id,
        metadata: { role: user.role, email: user.email },
        ipAddress: request.ip,
      });

      return user;
    });

    return reply.code(201).send(created);
  });

  app.patch('/users/:id', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN', 'SUPER_ADMIN']);
    const tenantId = app.resolveTenantId(request)!;
    const { id } = UserIdParam.parse(request.params);
    const body = UpdateUserSchema.parse(request.body);

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const existing = await tx.user.findFirst({
        where: { id, tenantId },
      });
      if (!existing) throw new AppError(404, 'User not found');

      if (auth.role === 'TENANT_ADMIN' && existing.role === 'TENANT_ADMIN') {
        throw new AppError(403, 'Tenant admins cannot update tenant admin accounts');
      }
      if (auth.role === 'TENANT_ADMIN' && body.role === 'TENANT_ADMIN') {
        throw new AppError(403, 'Tenant admins cannot assign tenant admin role');
      }

      const updated = await tx.user.update({
        where: { id },
        data: {
          name: body.name,
          role: body.role,
          deletedAt: body.active === undefined ? undefined : body.active ? null : new Date(),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          deletedAt: true,
          emailVerifiedAt: true,
        },
      });

      await logAudit(tx, {
        tenantId,
        userId: auth.userId,
        action: 'USER_UPDATED',
        entity: 'User',
        entityId: id,
        metadata: {
          role: updated.role,
          active: updated.deletedAt === null,
        },
        ipAddress: request.ip,
      });

      return updated;
    });
  });

  app.get('/me/document-requirements', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    if (auth.role !== 'BUYER') throw new AppError(403, 'Documents checklist is for buyers');

    return [
      {
        documentType: 'PROOF_OF_FUNDS',
        title: 'Proof of Funds',
        description: 'Recent bank/investment statement showing available purchase funds.',
      },
      {
        documentType: 'MORTGAGE_APPROVAL',
        title: 'Mortgage Approval in Principle',
        description: 'Current lender approval in principle or formal loan approval letter.',
      },
      {
        documentType: 'PROOF_OF_IDENTITY',
        title: 'Photo ID',
        description: 'Passport or driving licence for identity/AML checks.',
      },
      {
        documentType: 'PROOF_OF_ADDRESS',
        title: 'Proof of Address',
        description: 'Recent utility bill, bank statement, or tax letter.',
      },
      {
        documentType: 'SOURCE_OF_FUNDS',
        title: 'Source of Funds',
        description: 'Short explanation and supporting evidence for where purchase funds came from.',
      },
      {
        documentType: 'SOLICITOR_DETAILS',
        title: 'Solicitor Details',
        description: 'Name and contact details of your acting solicitor/conveyancer.',
      },
      {
        documentType: 'OTHER',
        title: 'Other Supporting Document',
        description: 'Any additional document requested by the agent/vendor team.',
      },
    ];
  });

  app.get('/me/documents', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    const tenantId = app.resolveTenantId(request)!;
    if (auth.role !== 'BUYER') throw new AppError(403, 'Only buyers can view their document submissions');

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const logs = await tx.auditLog.findMany({
        where: {
          tenantId,
          userId: auth.userId,
          action: 'BUYER_DOCUMENT_SUBMITTED',
          entity: 'User',
          entityId: auth.userId,
        },
        orderBy: { createdAt: 'desc' },
      });

      return logs.map((entry) => serializeDocument({ id: entry.id, createdAt: entry.createdAt, metadata: entry.metadata, userId: entry.userId }));
    });
  });

  app.post('/me/documents/upload', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = request.auth!;
    const tenantId = app.resolveTenantId(request)!;
    if (auth.role !== 'BUYER') throw new AppError(403, 'Only buyers can submit documents');

    const body = UploadBuyerDocumentBody.parse(request.body);

    const fileBuffer = Buffer.from(body.dataBase64, 'base64');
    if (!fileBuffer.length) throw new AppError(400, 'File data is empty');
    if (fileBuffer.length > MAX_UPLOAD_BYTES) throw new AppError(413, `File is too large. Maximum ${MAX_UPLOAD_BYTES / 1024 / 1024}MB`);

    const sanitizedFileName = safeFileName(body.fileName);
    const storedFileName = `${Date.now()}-${randomUUID()}-${sanitizedFileName}`;
    const uploadDir = join(UPLOAD_ROOT, tenantId, auth.userId);
    const absoluteFilePath = join(uploadDir, storedFileName);

    await mkdir(uploadDir, { recursive: true });
    await writeFile(absoluteFilePath, fileBuffer);

    const created = await withRequestContext({ tenantId, role: auth.role }, async (tx) =>
      tx.auditLog.create({
        data: {
          tenantId,
          userId: auth.userId,
          action: 'BUYER_DOCUMENT_SUBMITTED',
          entity: 'User',
          entityId: auth.userId,
          metadata: {
            documentType: body.documentType,
            documentTitle: body.documentTitle,
            notes: body.notes ?? null,
            status: 'SUBMITTED',
            fileName: sanitizedFileName,
            mimeType: body.mimeType,
            fileSize: fileBuffer.length,
            filePath: absoluteFilePath,
          },
        },
      }),
    );

    return reply.code(201).send(
      serializeDocument({
        id: created.id,
        createdAt: created.createdAt,
        metadata: created.metadata,
        userId: created.userId,
      }),
    );
  });

  app.get('/buyers/:buyerId/documents', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN', 'AGENT']);
    const tenantId = app.resolveTenantId(request)!;
    const { buyerId } = BuyerIdParam.parse(request.params);

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const buyer = await tx.user.findFirst({ where: { id: buyerId, tenantId, role: 'BUYER', deletedAt: null } });
      if (!buyer) throw new AppError(404, 'Buyer not found');

      const logs = await tx.auditLog.findMany({
        where: {
          tenantId,
          userId: buyerId,
          action: 'BUYER_DOCUMENT_SUBMITTED',
          entity: 'User',
          entityId: buyerId,
        },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      return logs.map((entry) =>
        serializeDocument({
          id: entry.id,
          createdAt: entry.createdAt,
          metadata: entry.metadata,
          userId: entry.userId,
          user: entry.user,
        }),
      );
    });
  });

  app.get('/buyer-documents', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN', 'AGENT']);
    const tenantId = app.resolveTenantId(request)!;

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const logs = await tx.auditLog.findMany({
        where: {
          tenantId,
          action: 'BUYER_DOCUMENT_SUBMITTED',
          entity: 'User',
        },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      return logs.map((entry) =>
        serializeDocument({
          id: entry.id,
          createdAt: entry.createdAt,
          metadata: entry.metadata,
          userId: entry.userId,
          user: entry.user,
        }),
      );
    });
  });

  app.post('/buyer-documents/:id/mark-received', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    requireRole(auth.role, ['TENANT_ADMIN', 'AGENT']);
    const tenantId = app.resolveTenantId(request)!;
    const { id } = DocumentIdParam.parse(request.params);

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const existing = await tx.auditLog.findFirst({
        where: { id, tenantId, action: 'BUYER_DOCUMENT_SUBMITTED', entity: 'User' },
      });
      if (!existing) throw new AppError(404, 'Document submission not found');

      const metadata = toMetadata(existing.metadata);
      const updated = await tx.auditLog.update({
        where: { id },
        data: {
          metadata: {
            ...metadata,
            status: 'RECEIVED',
            reviewedAt: new Date().toISOString(),
            reviewedBy: auth.userId,
          },
        },
      });

      return serializeDocument({
        id: updated.id,
        createdAt: updated.createdAt,
        metadata: updated.metadata,
        userId: updated.userId,
      });
    });
  });

  app.get('/buyer-documents/:id/file-content', { preHandler: app.authenticate }, async (request) => {
    const auth = request.auth!;
    const tenantId = app.resolveTenantId(request)!;
    const { id } = DocumentIdParam.parse(request.params);

    return withRequestContext({ tenantId, role: auth.role }, async (tx) => {
      const entry = await tx.auditLog.findFirst({
        where: {
          id,
          tenantId,
          action: 'BUYER_DOCUMENT_SUBMITTED',
          entity: 'User',
        },
      });

      if (!entry) throw new AppError(404, 'Document submission not found');

      if (auth.role === 'BUYER' && entry.userId !== auth.userId) {
        throw new AppError(403, 'You can only access your own documents');
      }

      if (!['BUYER', 'AGENT', 'TENANT_ADMIN'].includes(auth.role)) {
        throw new AppError(403, 'Insufficient role permissions');
      }

      const metadata = toMetadata(entry.metadata);
      if (!metadata.filePath || !metadata.fileName || !metadata.mimeType) {
        throw new AppError(409, 'No uploaded file found for this document');
      }

      const absolutePath = resolve(metadata.filePath);
      if (!absolutePath.startsWith(UPLOAD_ROOT)) {
        throw new AppError(500, 'Invalid stored file path');
      }

      const fileBuffer = await readFile(absolutePath);
      return {
        fileName: metadata.fileName,
        mimeType: metadata.mimeType,
        dataBase64: fileBuffer.toString('base64'),
      };
    });
  });
}
