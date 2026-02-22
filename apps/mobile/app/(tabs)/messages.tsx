import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@estate/ui';
import { Screen } from '../../src/components/Screen';
import { apiFetch } from '../../src/lib/api';

type MessageThread = {
  propertyId: string;
  propertyAddress: string;
  agentName: string;
  unreadCount: number;
  messageCount: number;
  lastMessage: {
    id: string;
    body: string;
    createdAt: string;
    senderId: string;
    readAt: string | null;
  };
};

function formatThreadTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const sameYear = date.getFullYear() === now.getFullYear();
  return sameYear ? date.toLocaleDateString([], { day: '2-digit', month: '2-digit' }) : date.toLocaleDateString();
}

export default function MessagesTab() {
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function loadThreads(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const res = await apiFetch('/messages/threads');
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? 'Could not load message threads');
        setThreads([]);
        return;
      }

      setThreads(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load message threads');
      setThreads([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadThreads();
  }, []);

  return (
    <Screen>
      {loading ? <Text style={{ marginBottom: 12, color: '#5B5E66' }}>Loading messages...</Text> : null}
      {error ? <Text style={{ marginBottom: 12, color: '#D64545' }}>{error}</Text> : null}

      {!loading && !threads.length ? (
        <Text style={{ color: '#5B5E66' }}>
          No messages yet. Start a conversation from a property by tapping Open Messages.
        </Text>
      ) : null}

      {threads.map((thread) => (
        <Pressable key={thread.propertyId} onPress={() => router.push(`/(tabs)/thread/${thread.propertyId}`)}>
          <View
            style={{
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: '#E6E8EC',
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                {thread.propertyAddress}
              </Text>
              <Text style={{ color: '#5B5E66' }}>{formatThreadTimestamp(thread.lastMessage.createdAt)}</Text>
            </View>
            <Text style={{ marginTop: 6, color: '#5B5E66' }} numberOfLines={1}>
              {thread.agentName}
            </Text>
            <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: '#5B5E66' }}>{thread.messageCount} message(s)</Text>
              {thread.unreadCount > 0 ? (
                <View
                  style={{
                    minWidth: 22,
                    paddingHorizontal: 7,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: '#1E6BFF',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{thread.unreadCount}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
      ))}

      {!loading ? (
        <Pressable onPress={() => loadThreads(true)} disabled={refreshing}>
          <Text style={{ color: '#1E6BFF', marginTop: 8 }}>{refreshing ? 'Refreshing...' : 'Refresh threads'}</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}
