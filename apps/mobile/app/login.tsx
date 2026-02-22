import { useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Button, Text, Card } from '@estate/ui';
import { Screen } from '../src/components/Screen';
import { API_URL } from '../src/lib/api';
import { saveSession } from '../src/lib/storage';

const DEMO_ACCOUNTS = [
  { label: 'Buyer Demo', email: 'buyer@acme.local', password: 'Passw0rd!' },
  { label: 'Agent Demo', email: 'agent@acme.local', password: 'Passw0rd!' },
  { label: 'Admin Demo', email: 'admin@acme.local', password: 'Passw0rd!' },
];

export default function LoginScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState(DEMO_ACCOUNTS[0]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function login() {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: selected.email,
          password: selected.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? 'Login failed');
        return;
      }

      await saveSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        tenantId: data.user?.tenantId ?? null,
        role: data.user?.role,
        userId: data.user?.id,
        name: data.user?.name,
        email: data.user?.email,
      });
      router.replace('/(tabs)/properties');
    } catch {
      setError(`Cannot reach API at ${API_URL}. Make sure the API server is running.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <Card style={{ marginTop: 20, gap: 12 }}>
        <Text style={{ fontSize: 32, fontWeight: '700' }}>Estate CRM</Text>
        <Text style={{ color: '#5B5E66' }}>Sign in with your account.</Text>

        {error ? <Text style={{ color: '#D64545' }}>{error}</Text> : null}

        <Text style={{ marginTop: 8, color: '#5B5E66' }}>Quick fill demo accounts</Text>
        <View style={{ gap: 8 }}>
          {DEMO_ACCOUNTS.map((account) => (
            <Button
              key={account.label}
              label={selected.email === account.email ? `${account.label} (Selected)` : account.label}
              onPress={() => {
                setSelected(account);
              }}
              disabled={submitting}
              style={{ backgroundColor: '#4F7FEA' }}
            />
          ))}
        </View>

        <Button
          label={submitting ? 'Signing In...' : `Sign In as ${selected.label}`}
          onPress={login}
          disabled={submitting}
        />
      </Card>
    </Screen>
  );
}
