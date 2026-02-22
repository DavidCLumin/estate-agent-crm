import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Button, Card, Text, TextField } from '@estate/ui';
import { Screen } from '../../../src/components/Screen';
import { apiFetch } from '../../../src/lib/api';

export default function PropertyMessagesScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const [rows, setRows] = useState<any[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function markMessagesAsRead(messages: any[]) {
    const unreadIds = messages
      .filter((row) => row?.id && !String(row.id).startsWith('optimistic-') && row.readAt === null)
      .map((row) => row.id as string);

    if (!unreadIds.length) return;

    const unreadSet = new Set(unreadIds);
    setRows((prev) =>
      prev.map((row) => (unreadSet.has(row.id) ? { ...row, readAt: new Date().toISOString() } : row)),
    );

    await Promise.allSettled(unreadIds.map((id) => apiFetch(`/messages/${id}/read`, { method: 'POST' })));
  }

  async function load() {
    if (!propertyId) return;
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch(`/properties/${propertyId}/messages`);
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? 'Could not load messages');
        return;
      }
      const parsed = Array.isArray(data) ? data : [];
      setRows(parsed);
      void markMessagesAsRead(parsed);
    } catch {
      setError('Could not load messages');
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    const trimmed = body.trim();
    if (!propertyId || !trimmed || sending) return;

    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMessage = {
      id: optimisticId,
      body: trimmed,
      createdAt: new Date().toISOString(),
    };

    setError('');
    setSending(true);
    setRows((prev) => [...prev, optimisticMessage]);
    setBody('');

    try {
      const res = await apiFetch(`/properties/${propertyId}/messages`, { method: 'POST', body: JSON.stringify({ body: trimmed }) });
      const data = await res.json();
      if (!res.ok) {
        setRows((prev) => prev.filter((item) => item.id !== optimisticId));
        setError(data?.message ?? 'Could not send message');
        setBody(trimmed);
        return;
      }
      setRows((prev) => prev.map((item) => (item.id === optimisticId ? data : item)));
    } catch {
      setRows((prev) => prev.filter((item) => item.id !== optimisticId));
      setError('Could not send message');
      setBody(trimmed);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    load();
  }, [propertyId]);

  return (
    <Screen>
      {loading ? <Text style={{ marginBottom: 8, color: '#5B5E66' }}>Loading messages...</Text> : null}
      {error ? <Text style={{ marginBottom: 8, color: '#D64545' }}>{error}</Text> : null}
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={!loading ? <Text style={{ color: '#5B5E66', marginBottom: 8 }}>No messages yet</Text> : null}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: 8 }}>
            <Text>{item.body}</Text>
            <Text style={{ color: '#5B5E66', marginTop: 6 }}>{new Date(item.createdAt).toLocaleString()}</Text>
          </Card>
        )}
      />
      <View style={{ gap: 8 }}>
        <TextField value={body} onChangeText={setBody} placeholder="Message" />
        <Button label={sending ? 'Sending...' : 'Send'} onPress={send} disabled={sending || !body.trim()} />
      </View>
    </Screen>
  );
}
