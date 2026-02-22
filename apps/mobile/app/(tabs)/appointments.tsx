import { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Button, Card, Text } from '@estate/ui';
import { Screen } from '../../src/components/Screen';
import { apiFetch } from '../../src/lib/api';

export default function AppointmentsScreen() {
  const [me, setMe] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadMe() {
    const res = await apiFetch('/me');
    const data = await res.json();
    if (res.ok) setMe(data);
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/appointments');
      const data = await res.json();
      if (!res.ok) {
        setRows([]);
        setError(data?.message ?? 'Could not load appointments');
        return;
      }
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
      setError('Could not load appointments');
    } finally {
      setLoading(false);
    }
  }

  async function runAction(id: string, action: 'approve' | 'decline' | 'complete') {
    const path =
      action === 'approve'
        ? `/appointments/${id}/approve`
        : action === 'decline'
          ? `/appointments/${id}/decline`
          : `/appointments/${id}/complete`;

    const body =
      action === 'complete'
        ? {
            outcomeNote: 'Viewing completed in mobile workflow',
            followUpAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
          }
        : undefined;

    const res = await apiFetch(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.ok) await load();
  }

  useEffect(() => {
    loadMe();
    load();
  }, []);

  const isBuyer = me?.role === 'BUYER';

  return (
    <Screen>
      {loading ? <Text style={{ marginBottom: 8, color: '#5B5E66' }}>Loading appointments...</Text> : null}
      {error ? <Text style={{ marginBottom: 8, color: '#D64545' }}>{error}</Text> : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: 10 }}>
            <Text style={{ fontWeight: '600' }}>{item.property?.title}</Text>
            <Text>Status: {item.status}</Text>
            <Text style={{ color: '#5B5E66' }}>{new Date(item.createdAt).toLocaleString()}</Text>
            <Text style={{ marginTop: 4, color: '#5B5E66' }}>
              Slot: {new Date(item.preferredStart).toLocaleString()} - {new Date(item.preferredEnd).toLocaleTimeString()}
            </Text>

            {!isBuyer ? (
              <View style={{ marginTop: 10, gap: 8 }}>
                <Button label="Approve" onPress={() => runAction(item.id, 'approve')} />
                <Button label="Decline" onPress={() => runAction(item.id, 'decline')} style={{ backgroundColor: '#74839E' }} />
                <Button label="Mark Completed + Follow-up" onPress={() => runAction(item.id, 'complete')} style={{ backgroundColor: '#4F7FEA' }} />
              </View>
            ) : null}
          </Card>
        )}
      />
    </Screen>
  );
}
