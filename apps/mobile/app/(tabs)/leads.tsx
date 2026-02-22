import { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Button, Card, Text, TextField } from '@estate/ui';
import { Screen } from '../../src/components/Screen';
import { apiFetch } from '../../src/lib/api';

type Lead = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  source?: string | null;
  nextFollowUpAt?: string | null;
  assignedAgent?: { id: string; name: string } | null;
};

const STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING_BOOKED', 'OFFER_MADE', 'CLOSED_WON', 'CLOSED_LOST'];

export default function LeadsScreen() {
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('');
  const [creating, setCreating] = useState(false);

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const res = await apiFetch('/leads');
      const data = await res.json();
      if (!res.ok) {
        setRows([]);
        setError(data?.message ?? 'Could not load leads');
        return;
      }
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
      setError('Could not load leads');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function createLead() {
    if (creating) return;
    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are required');
      return;
    }

    setCreating(true);
    setError('');
    try {
      const res = await apiFetch('/leads', {
        method: 'POST',
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          source: source.trim() || undefined,
          status: 'NEW',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? 'Could not create lead');
        return;
      }

      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
      setSource('');
      await load();
    } catch {
      setError('Could not create lead');
    } finally {
      setCreating(false);
    }
  }

  async function advanceStatus(lead: Lead) {
    const idx = STATUSES.indexOf(lead.status);
    const nextStatus = STATUSES[Math.min(idx + 1, STATUSES.length - 1)];
    if (nextStatus === lead.status) return;

    const res = await apiFetch(`/leads/${lead.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) await load(true);
  }

  async function addFollowUpTomorrow(lead: Lead) {
    const dueAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
    const res = await apiFetch('/reminders', {
      method: 'POST',
      body: JSON.stringify({
        title: `Follow up ${lead.firstName} ${lead.lastName}`,
        body: `Follow up lead from ${lead.source ?? 'unknown source'}`,
        dueAt,
        leadId: lead.id,
        channel: 'IN_APP',
      }),
    });
    if (res.ok) await load(true);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Screen>
      <Card style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: '700' }}>Lead Capture</Text>
        <View style={{ height: 8 }} />
        <TextField value={firstName} onChangeText={setFirstName} placeholder="First name" />
        <View style={{ height: 8 }} />
        <TextField value={lastName} onChangeText={setLastName} placeholder="Last name" />
        <View style={{ height: 8 }} />
        <TextField value={email} onChangeText={setEmail} placeholder="Email" />
        <View style={{ height: 8 }} />
        <TextField value={phone} onChangeText={setPhone} placeholder="Phone" />
        <View style={{ height: 8 }} />
        <TextField value={source} onChangeText={setSource} placeholder="Source (portal, website, referral...)" />
        <View style={{ height: 10 }} />
        <Button label={creating ? 'Creating...' : 'Create Lead'} onPress={createLead} disabled={creating} />
      </Card>

      {loading ? <Text style={{ marginBottom: 8, color: '#5B5E66' }}>Loading leads...</Text> : null}
      {error ? <Text style={{ marginBottom: 8, color: '#D64545' }}>{error}</Text> : null}

      <FlatList
        data={rows}
        onRefresh={() => load(true)}
        refreshing={refreshing}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={!loading ? <Text style={{ color: '#5B5E66' }}>No leads yet.</Text> : null}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: 10 }}>
            <Text style={{ fontWeight: '700', fontSize: 18 }}>
              {item.firstName} {item.lastName}
            </Text>
            <Text style={{ color: '#5B5E66', marginTop: 4 }}>{item.email || item.phone || 'No contact details'}</Text>
            <Text style={{ marginTop: 4 }}>Status: {item.status}</Text>
            <Text style={{ marginTop: 4, color: '#5B5E66' }}>Source: {item.source || '-'}</Text>
            <Text style={{ marginTop: 4, color: '#5B5E66' }}>
              Follow-up: {item.nextFollowUpAt ? new Date(item.nextFollowUpAt).toLocaleString() : '-'}
            </Text>
            <View style={{ height: 10 }} />
            <Button label="Advance Stage" onPress={() => advanceStatus(item)} />
            <View style={{ height: 8 }} />
            <Button label="Add Follow-up Reminder" onPress={() => addFollowUpTomorrow(item)} style={{ backgroundColor: '#4F7FEA' }} />
          </Card>
        )}
      />
    </Screen>
  );
}
