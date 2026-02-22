import { useEffect, useState } from 'react';
import { FlatList } from 'react-native';
import { Button, Card, Text } from '@estate/ui';
import { Screen } from '../../src/components/Screen';
import { apiFetch } from '../../src/lib/api';

type Reminder = {
  id: string;
  title: string;
  body?: string | null;
  dueAt: string;
  completedAt?: string | null;
  lead?: { id: string; firstName: string; lastName: string; status: string } | null;
  property?: { id: string; title: string; address: string } | null;
};

export default function RemindersScreen() {
  const [rows, setRows] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/reminders?includeCompleted=false&mineOnly=true');
      const data = await res.json();
      if (!res.ok) {
        setRows([]);
        setError(data?.message ?? 'Could not load reminders');
        return;
      }
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
      setError('Could not load reminders');
    } finally {
      setLoading(false);
    }
  }

  async function toggle(reminder: Reminder) {
    const res = await apiFetch(`/reminders/${reminder.id}/complete`, { method: 'POST' });
    if (res.ok) await load();
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Screen>
      {loading ? <Text style={{ marginBottom: 8, color: '#5B5E66' }}>Loading reminders...</Text> : null}
      {error ? <Text style={{ marginBottom: 8, color: '#D64545' }}>{error}</Text> : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={!loading ? <Text style={{ color: '#5B5E66' }}>No reminders due.</Text> : null}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: 10 }}>
            <Text style={{ fontWeight: '700', fontSize: 18 }}>{item.title}</Text>
            {item.body ? <Text style={{ color: '#5B5E66', marginTop: 6 }}>{item.body}</Text> : null}
            <Text style={{ marginTop: 6 }}>Due: {new Date(item.dueAt).toLocaleString()}</Text>
            {item.lead ? (
              <Text style={{ marginTop: 4, color: '#5B5E66' }}>
                Lead: {item.lead.firstName} {item.lead.lastName} ({item.lead.status})
              </Text>
            ) : null}
            {item.property ? <Text style={{ marginTop: 4, color: '#5B5E66' }}>Property: {item.property.title}</Text> : null}
            <Text style={{ marginTop: 4 }}>Status: {item.completedAt ? 'Completed' : 'Open'}</Text>
            <Text style={{ marginTop: 4, color: '#5B5E66' }}>Channel: IN_APP (push-ready backend model)</Text>
            <Text style={{ marginTop: 4, color: '#5B5E66' }}>Offline writes are queued and auto-synced.</Text>
            <Text style={{ marginTop: 10, color: '#5B5E66' }}>Mark complete to close this follow-up.</Text>
            <Button label={item.completedAt ? 'Reopen Reminder' : 'Mark Complete'} onPress={() => toggle(item)} />
          </Card>
        )}
      />
    </Screen>
  );
}
