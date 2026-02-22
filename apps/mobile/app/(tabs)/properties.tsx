import { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Button, Card, Text, TextField } from '@estate/ui';
import { Screen } from '../../src/components/Screen';
import { apiFetch } from '../../src/lib/api';

function extractValidationMessage(data: any): string | null {
  const fieldErrors = data?.issues?.fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== 'object') return null;

  const firstField = Object.keys(fieldErrors)[0];
  if (!firstField) return null;
  const firstIssue = Array.isArray(fieldErrors[firstField]) ? fieldErrors[firstField][0] : null;
  if (!firstIssue) return null;
  return `${firstField}: ${firstIssue}`;
}

export default function PropertiesScreen() {
  const [me, setMe] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftAddress, setDraftAddress] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftPriceGuide, setDraftPriceGuide] = useState('');
  const [draftMinimumOffer, setDraftMinimumOffer] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch('/properties');
      const data = await res.json();
      if (!res.ok) {
        setRows([]);
        setError(data?.message ?? 'Could not load properties');
        return;
      }
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
      setError('Could not load properties');
    } finally {
      setLoading(false);
    }
  }

  async function loadMe() {
    const res = await apiFetch('/me');
    const data = await res.json();
    if (res.ok) setMe(data);
  }

  async function createListing(status: 'DRAFT' | 'LIVE') {
    if (submitting) return;
    if (!draftTitle.trim() || !draftAddress.trim() || !draftDescription.trim() || !draftPriceGuide.trim()) {
      setError('Fill title, address, description and price');
      return;
    }
    const numericPrice = Number(draftPriceGuide);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setError('Price must be a valid number');
      return;
    }
    const trimmedMinimum = draftMinimumOffer.trim();
    const numericMinimum = trimmedMinimum ? Number(trimmedMinimum) : null;
    if (trimmedMinimum && (!Number.isFinite(numericMinimum) || Number(numericMinimum) < 0)) {
      setError('Minimum offer must be a valid number');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch('/properties', {
        method: 'POST',
        body: JSON.stringify({
          title: draftTitle.trim(),
          address: draftAddress.trim(),
          description: draftDescription.trim(),
          priceGuide: numericPrice,
          minimumOffer: numericMinimum,
          status,
          biddingMode: 'OPEN',
          minIncrement: 1000,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const validation = extractValidationMessage(data);
        setError(validation ?? data?.message ?? 'Could not create listing');
        return;
      }

      setDraftTitle('');
      setDraftAddress('');
      setDraftDescription('');
      setDraftPriceGuide('');
      setDraftMinimumOffer('');
      if (status === 'LIVE') {
        setCreating(false);
      }
      await load();
    } catch {
      setError('Could not create listing');
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    loadMe();
    load();
  }, []);

  const canCreate = me?.role === 'AGENT' || me?.role === 'TENANT_ADMIN';

  return (
    <Screen>
      {canCreate ? (
        <Card style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '700' }}>Listings Workflow</Text>
          <Text style={{ marginTop: 6, color: '#5B5E66' }}>Create a new listing, then save as draft or publish.</Text>
          <View style={{ height: 10 }} />
          {!creating ? <Button label="Create New Listing" onPress={() => setCreating(true)} /> : null}
          {creating ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontWeight: '600' }}>Title</Text>
              <TextField value={draftTitle} onChangeText={setDraftTitle} placeholder="e.g. Fernhill House" />
              <View style={{ height: 8 }} />
              <Text style={{ fontWeight: '600' }}>Address</Text>
              <TextField value={draftAddress} onChangeText={setDraftAddress} placeholder="Address (line 1, line 2)" />
              <View style={{ height: 8 }} />
              <Text style={{ fontWeight: '600' }}>Description</Text>
              <TextField value={draftDescription} onChangeText={setDraftDescription} placeholder="Brief description" />
              <View style={{ height: 8 }} />
              <Text style={{ fontWeight: '600' }}>Price Guide</Text>
              <TextField value={draftPriceGuide} onChangeText={setDraftPriceGuide} keyboardType="numeric" placeholder="e.g. 450000" />
              <View style={{ height: 8 }} />
              <Text style={{ fontWeight: '600' }}>Minimum Offer (staff only)</Text>
              <TextField value={draftMinimumOffer} onChangeText={setDraftMinimumOffer} keyboardType="numeric" placeholder="Optional minimum offer" />
              <View style={{ height: 10 }} />
              <Button label={submitting ? 'Saving...' : 'Save as Draft'} onPress={() => createListing('DRAFT')} disabled={submitting} />
              <View style={{ height: 8 }} />
              <Button label={submitting ? 'Publishing...' : 'Publish'} onPress={() => createListing('LIVE')} disabled={submitting} />
              <View style={{ height: 8 }} />
              <Button
                label="Cancel"
                onPress={() => {
                  setCreating(false);
                  setError('');
                }}
                style={{ backgroundColor: '#8B9099' }}
                disabled={submitting}
              />
            </View>
          ) : null}
        </Card>
      ) : null}

      {loading ? <Text style={{ marginBottom: 8, color: '#5B5E66' }}>Loading properties...</Text> : null}
      {error ? <Text style={{ marginBottom: 8, color: '#D64545' }}>{error}</Text> : null}
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        onRefresh={load}
        refreshing={loading}
        ListEmptyComponent={!loading && !error ? <Text style={{ color: '#5B5E66' }}>No properties found.</Text> : null}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => (
          <Card>
            <Pressable onPress={() => router.push(`/(tabs)/property/${item.id}`)}>
              <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 8 }}>{item.title}</Text>
              <Text style={{ color: '#5B5E66', marginBottom: 8 }}>{item.address}</Text>
              <Badge label={item.status} tone={item.status === 'LIVE' ? 'success' : 'neutral'} />
            </Pressable>
            <View style={{ height: 10 }} />
            <Button label="Messages" onPress={() => router.push(`/(tabs)/thread/${item.id}`)} />
          </Card>
        )}
      />
    </Screen>
  );
}
