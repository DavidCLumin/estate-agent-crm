import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { getSession } from '../src/lib/storage';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    const fallbackTimer = setTimeout(() => {
      if (isMounted) {
        router.replace('/login');
      }
    }, 2500);

    (async () => {
      try {
        const s = await getSession();
        if (!isMounted) return;
        if (s.accessToken) router.replace('/(tabs)/properties');
        else router.replace('/login');
      } catch {
        if (isMounted) router.replace('/login');
      } finally {
        clearTimeout(fallbackTimer);
      }
    })();

    return () => {
      isMounted = false;
      clearTimeout(fallbackTimer);
    };
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' }}>
      <ActivityIndicator />
      <View style={{ height: 8 }} />
      <Text style={{ color: '#111827' }}>Starting app...</Text>
    </View>
  );
}
