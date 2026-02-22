import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withRequestContext } from '../../lib/context';
import { logAudit } from '../audit/service';
import { env } from '../../lib/env';

const ClientErrorSchema = z.object({
  message: z.string().min(1).max(5000),
  stack: z.string().max(20000).optional(),
  screen: z.string().max(250).optional(),
  appVersion: z.string().max(100).optional(),
  platform: z.string().max(50).optional(),
});

export async function monitoringRoutes(app: FastifyInstance) {
  app.post(
    '/client-errors',
    {
      preHandler: app.authenticate,
      config: {
        rateLimit: {
          max: env.CLIENT_ERROR_RATE_LIMIT_MAX,
          timeWindow: env.CLIENT_ERROR_RATE_LIMIT_WINDOW,
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const tenantId = app.resolveTenantId(request)!;
      const body = ClientErrorSchema.parse(request.body);

      app.log.error(
        {
          requestId: request.id,
          userId: auth.userId,
          tenantId,
          screen: body.screen,
          platform: body.platform,
          appVersion: body.appVersion,
          message: body.message,
          stack: body.stack,
        },
        'Client runtime error reported',
      );

      await withRequestContext({ tenantId, role: auth.role }, async (tx) => {
        await logAudit(tx, {
          tenantId,
          userId: auth.userId,
          action: 'CLIENT_ERROR_REPORTED',
          entity: 'ClientError',
          entityId: request.id,
          metadata: {
            message: body.message,
            screen: body.screen,
            platform: body.platform,
            appVersion: body.appVersion,
          },
        });
      });

      return reply.code(202).send({ accepted: true });
    },
  );
}
