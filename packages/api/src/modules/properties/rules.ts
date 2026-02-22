import type { PropertyStatus } from '@prisma/client';
import { AppError } from '../../lib/errors';

const ALLOWED_STATUS_TRANSITIONS: Record<PropertyStatus, PropertyStatus[]> = {
  DRAFT: ['DRAFT', 'LIVE'],
  LIVE: ['LIVE', 'UNDER_OFFER'],
  UNDER_OFFER: ['UNDER_OFFER', 'SOLD'],
  SOLD: ['SOLD'],
};

export function validatePropertyStatusTransition(current: PropertyStatus, next: PropertyStatus) {
  const allowed = ALLOWED_STATUS_TRANSITIONS[current];
  if (allowed.includes(next)) return;
  throw new AppError(409, `Invalid status transition from ${current} to ${next}`, 'INVALID_STATUS_TRANSITION');
}
