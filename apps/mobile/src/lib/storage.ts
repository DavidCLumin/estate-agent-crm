import * as SecureStore from 'expo-secure-store';

const KEYS = {
  access: 'estate_access_token',
  refresh: 'estate_refresh_token',
  tenantId: 'estate_tenant_id',
  role: 'estate_user_role',
  userId: 'estate_user_id',
  name: 'estate_user_name',
  email: 'estate_user_email',
};

export type StoredSession = {
  accessToken?: string | null;
  refreshToken?: string | null;
  tenantId?: string | null;
  role?: string | null;
  userId?: string | null;
  name?: string | null;
  email?: string | null;
};

export async function saveSession(session: {
  accessToken: string;
  refreshToken: string;
  tenantId: string | null;
  role?: string | null;
  userId?: string | null;
  name?: string | null;
  email?: string | null;
}) {
  await SecureStore.setItemAsync(KEYS.access, session.accessToken);
  await SecureStore.setItemAsync(KEYS.refresh, session.refreshToken);
  await SecureStore.setItemAsync(KEYS.tenantId, session.tenantId ?? '');
  await SecureStore.setItemAsync(KEYS.role, session.role ?? '');
  await SecureStore.setItemAsync(KEYS.userId, session.userId ?? '');
  await SecureStore.setItemAsync(KEYS.name, session.name ?? '');
  await SecureStore.setItemAsync(KEYS.email, session.email ?? '');
}

export async function getSession(): Promise<StoredSession> {
  const [accessToken, refreshToken, tenantId, role, userId, name, email] = await Promise.all([
    SecureStore.getItemAsync(KEYS.access),
    SecureStore.getItemAsync(KEYS.refresh),
    SecureStore.getItemAsync(KEYS.tenantId),
    SecureStore.getItemAsync(KEYS.role),
    SecureStore.getItemAsync(KEYS.userId),
    SecureStore.getItemAsync(KEYS.name),
    SecureStore.getItemAsync(KEYS.email),
  ]);
  return {
    accessToken,
    refreshToken,
    tenantId: tenantId || undefined,
    role: role || undefined,
    userId: userId || undefined,
    name: name || undefined,
    email: email || undefined,
  };
}

export async function updateSessionTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync(KEYS.access, accessToken);
  await SecureStore.setItemAsync(KEYS.refresh, refreshToken);
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.access),
    SecureStore.deleteItemAsync(KEYS.refresh),
    SecureStore.deleteItemAsync(KEYS.tenantId),
    SecureStore.deleteItemAsync(KEYS.role),
    SecureStore.deleteItemAsync(KEYS.userId),
    SecureStore.deleteItemAsync(KEYS.name),
    SecureStore.deleteItemAsync(KEYS.email),
  ]);
}
