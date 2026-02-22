import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { getSession } from '../../src/lib/storage';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState<string | undefined>();

  useEffect(() => {
    getSession().then((session) => setRole(session.role ?? undefined));
  }, []);

  const isBuyer = role === 'BUYER';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 56 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="property/[id]" options={{ href: null }} />
      <Tabs.Screen name="thread/[propertyId]" options={{ href: null }} />
      <Tabs.Screen name="properties" options={{ title: 'Properties' }} />
      <Tabs.Screen name="appointments" options={{ title: 'Appointments' }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
      <Tabs.Screen name="leads" options={{ title: 'Leads', href: isBuyer ? null : undefined }} />
      <Tabs.Screen name="reminders" options={{ title: 'Reminders', href: isBuyer ? null : undefined }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
