import { cacheGet, cacheSet, flushQueue, queueWrite } from './offline';
import { clearSession, getSession, updateSessionTokens } from './storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

function makeHeaders(init: RequestInit | undefined, accessToken?: string | null, tenantId?: string | null) {
  const hasBody = typeof init?.body === 'string' && init.body.length > 0;
  return {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
    ...(init?.headers ?? {}),
  };
}

async function tryRefreshToken(path: string, init: RequestInit | undefined) {
  const session = await getSession();
  if (!session.refreshToken) return null;

  const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  if (!refreshRes.ok) {
    await clearSession();
    return null;
  }
  const tokens = await refreshRes.json();
  await updateSessionTokens(tokens.accessToken, tokens.refreshToken);

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: makeHeaders(init, tokens.accessToken, session.tenantId),
  });
}

async function flushPendingWrites() {
  await flushQueue(async (item) => {
    const session = await getSession();
    if (!session.accessToken) return false;
    try {
      const res = await fetch(`${API_URL}${item.path}`, {
        method: item.method,
        headers: makeHeaders(undefined, session.accessToken, session.tenantId),
        body: item.body,
      });
      return res.ok;
    } catch {
      return false;
    }
  });
}

export async function apiFetch(path: string, init?: RequestInit) {
  const session = await getSession();
  const method = (init?.method ?? 'GET').toUpperCase();
  const isWrite = method !== 'GET';

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: makeHeaders(init, session.accessToken, session.tenantId),
    });
  } catch {
    if (isWrite) {
      await queueWrite({
        path,
        method: method as 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        body: typeof init?.body === 'string' ? init.body : undefined,
      });
      return new Response(JSON.stringify({ message: 'Saved offline. Will sync when online.' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cached = await cacheGet(path);
    if (cached) {
      return new Response(cached.body, {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Offline-Cache': '1' },
      });
    }
    throw new Error('Network unavailable');
  }

  if (res.status === 401) {
    const retried = await tryRefreshToken(path, init);
    if (retried) res = retried;
  }

  if (res.ok && method === 'GET') {
    const text = await res.clone().text();
    await cacheSet(path, text);
  }

  if (res.ok && isWrite) {
    await flushPendingWrites();
  }

  return res;
}

export async function flushOfflineWrites() {
  await flushPendingWrites();
}

export async function apiGetJson<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  return (await res.json()) as T;
}

export async function apiPostJson<T = any>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, {
    ...init,
    method: init?.method ?? 'POST',
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

type ClientErrorPayload = {
  message: string;
  stack?: string;
  screen?: string;
  appVersion?: string;
  platform?: string;
};

export async function reportClientError(payload: ClientErrorPayload) {
  try {
    await apiPostJson('/client-errors', payload);
  } catch {
    // Never let telemetry reporting break UX.
  }
}

export { API_URL };
