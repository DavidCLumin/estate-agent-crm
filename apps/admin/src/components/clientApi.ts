import { API_URL, authHeaders } from './api';

export async function authedFetch(path: string, init?: RequestInit) {
  const token = localStorage.getItem('estate_access_token') ?? '';
  const tenantId = localStorage.getItem('estate_tenant_id') ?? '';
  const hasBody = typeof init?.body === 'string' && init.body.length > 0;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...authHeaders(token, tenantId || undefined, hasBody),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    localStorage.clear();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  return res;
}
