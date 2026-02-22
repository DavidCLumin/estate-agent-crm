import type { FastifyInstance } from 'fastify';
import { authRoutes } from './modules/auth/routes';
import { propertyRoutes } from './modules/properties/routes';
import { appointmentRoutes } from './modules/appointments/routes';
import { bidRoutes } from './modules/bids/routes';
import { auditRoutes } from './modules/audit/routes';
import { tenantRoutes } from './modules/tenants/routes';
import { messageRoutes } from './modules/messages/routes';
import { userRoutes } from './modules/users/routes';
import { leadRoutes } from './modules/leads/routes';
import { monitoringRoutes } from './modules/monitoring/routes';

export async function registerRoutes(app: FastifyInstance) {
  await authRoutes(app);
  await userRoutes(app);
  await propertyRoutes(app);
  await appointmentRoutes(app);
  await bidRoutes(app);
  await auditRoutes(app);
  await tenantRoutes(app);
  await messageRoutes(app);
  await leadRoutes(app);
  await monitoringRoutes(app);
}
