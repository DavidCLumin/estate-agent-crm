import { AppError } from './errors';
import type { Role } from '@prisma/client';

export function requireRole(userRole: Role, allowed: Role[]) {
  if (!allowed.includes(userRole)) {
    throw new AppError(403, 'Insufficient role permissions', 'FORBIDDEN');
  }
}
