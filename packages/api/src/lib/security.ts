import argon2 from 'argon2';
import crypto from 'node:crypto';

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

export async function hashPassword(password: string) {
  return argon2.hash(password);
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

export function hashRefreshToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function buildBidHash(input: {
  tenantId: string;
  propertyId: string;
  buyerUserId: string;
  amount: string;
  createdAtIso: string;
  secret: string;
}) {
  const raw = `${input.tenantId}:${input.propertyId}:${input.buyerUserId}:${input.amount}:${input.createdAtIso}:${input.secret}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}
