import { Stack, usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { flushOfflineWrites, reportClientError } from '../src/lib/api';
import { getSession } from '../src/lib/storage';

const BUYER_ALLOWED = new Set(['properties', 'property', 'appointments', 'messages', 'thread', 'profile']);
const STAFF_ALLOWED = new Set(['properties', 'property', 'appointments', 'messages', 'thread', 'profile', 'leads', 'reminders']);

function routeKey(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  const tabsIndex = parts.indexOf('(tabs)');
  if (tabsIndex === -1) return null;
  return parts[tabsIndex + 1] ?? null;
}

function hasAccess(role: string | undefined, pathname: string) {
  const key = routeKey(pathname);
  if (!key) return true;
  if (!role) return false;

  if (role === 'BUYER') return BUYER_ALLOWED.has(key);
  return STAFF_ALLOWED.has(key);
}

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSession>> | null>(null);

  const authenticated = useMemo(() => Boolean(session?.accessToken), [session?.accessToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await getSession();
        if (!cancelled) {
          setSession(next);
        }
      } catch {
        if (!cancelled) {
          setSession(null);
        }
      } finally {
        if (!cancelled) {
          setBooting(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (booting) return;

    const onLogin = pathname === '/login';
    const onTabs = pathname.startsWith('/(tabs)');

    if (!authenticated && onTabs) {
      router.replace('/login');
      return;
    }

    if (authenticated && onLogin) {
      router.replace('/(tabs)/properties');
      return;
    }

    if (authenticated && onTabs && !hasAccess(session?.role ?? undefined, pathname)) {
      router.replace('/(tabs)/properties');
    }
  }, [booting, authenticated, pathname, router, session?.role]);

  useEffect(() => {
    if (!authenticated) return;
    flushOfflineWrites().catch(() => undefined);
  }, [authenticated, pathname]);

  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F5F8' }}>
        <ActivityIndicator size="large" color="#1E6BFF" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        headerShown: false,
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const stack = typeof error?.stack === 'string' ? error.stack : '';

  useEffect(() => {
    reportClientError({
      message: error?.message ?? String(error),
      stack: stack || undefined,
      screen: 'RootLayout',
      platform: 'mobile',
    }).catch(() => undefined);
  }, [error?.message, stack]);

  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: 20,
        paddingVertical: 28,
        backgroundColor: '#FFF4F4',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: '700', color: '#9F1239', marginBottom: 10 }}>App crashed on startup</Text>
      <Text style={{ fontSize: 15, color: '#4B5563', marginBottom: 14 }}>This is the real JS error causing the white screen:</Text>
      <Text style={{ fontSize: 13, color: '#111827', marginBottom: 20 }}>{error?.message ?? String(error)}</Text>
      {stack ? (
        <Text selectable style={{ fontSize: 11, color: '#4B5563', marginBottom: 20 }}>
          {stack}
        </Text>
      ) : null}
      <Pressable
        onPress={retry}
        style={{
          alignSelf: 'flex-start',
          backgroundColor: '#1E6BFF',
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Retry</Text>
      </Pressable>
    </View>
  );
}
