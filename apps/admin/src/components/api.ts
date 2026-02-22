export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function authHeaders(token?: string, tenantId?: string, hasJsonBody = false) {
  return {
    ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
  };
}
