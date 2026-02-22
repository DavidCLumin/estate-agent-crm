import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Share, TextInput, View } from 'react-native';
import { Button, Card, Text } from '@estate/ui';
import { Screen } from '../../../src/components/Screen';
import { apiFetch } from '../../../src/lib/api';
import { applyOptimisticBid, getClientBidValidationError } from '../../../src/lib/bidRules';

function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined) return '-';
  return Number(value).toLocaleString();
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return '-';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function toNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function safeNotificationHaptic() {
  // Disabled on this screen to avoid native bridge runtime crashes in dev client.
  return;
}

async function safeImpactHaptic() {
  // Disabled on this screen to avoid native bridge runtime crashes in dev client.
  return;
}

function InlineInput(props: any) {
  return (
    <TextInput
      {...props}
      placeholderTextColor="#8B9099"
      style={[
        {
          backgroundColor: '#fff',
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 10,
          fontSize: 16,
        },
        props?.style,
      ]}
    />
  );
}

export default function PropertyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [me, setMe] = useState<any>(null);
  const [property, setProperty] = useState<any>(null);
  const [ownBids, setOwnBids] = useState<any[]>([]);
  const [bidHistory, setBidHistory] = useState<any[]>([]);
  const [highestBid, setHighestBid] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [start, setStart] = useState('2026-02-20T18:00:00.000Z');
  const [end, setEnd] = useState('2026-02-20T18:30:00.000Z');
  const [loading, setLoading] = useState(true);
  const [bidSubmitting, setBidSubmitting] = useState(false);
  const [appointmentSubmitting, setAppointmentSubmitting] = useState(false);
  const [listingSubmitting, setListingSubmitting] = useState(false);
  const [editingDraft, setEditingDraft] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriceGuide, setEditPriceGuide] = useState('');
  const [editMinimumOffer, setEditMinimumOffer] = useState('');
  const [error, setError] = useState('');
  const [listingMessage, setListingMessage] = useState('');
  const [bidMessage, setBidMessage] = useState('');
  const [appointmentMessage, setAppointmentMessage] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  async function loadPropertyAndBids() {
    if (!id) return;
    setError('');
    setLoading(true);
    try {
      const [meRes, propertiesRes] = await Promise.all([apiFetch('/me'), apiFetch('/properties')]);
      const [meData, propertiesData] = await Promise.all([meRes.json(), propertiesRes.json()]);

      if (meRes.ok) setMe(meData);
      if (!propertiesRes.ok) throw new Error(propertiesData?.message ?? 'Could not load properties');

      const found = propertiesData.find((x: any) => x.id === id);
      if (!found) throw new Error('Property not found');
      setProperty(found);
      setEditTitle(found.title ?? '');
      setEditAddress(found.address ?? '');
      setEditDescription(found.description ?? '');
      setEditPriceGuide(String(found.priceGuide ?? ''));
      setEditMinimumOffer(found.minimumOffer === null || found.minimumOffer === undefined ? '' : String(found.minimumOffer));

      const isBuyer = meData?.role === 'BUYER';
      if (isBuyer && found.status !== 'LIVE') {
        setOwnBids([]);
        setBidHistory([]);
        setHighestBid(null);
        return;
      }

      const bidsRes = await apiFetch(`/properties/${id}/bids`);
      const bidsData = await bidsRes.json();
      if (!bidsRes.ok) throw new Error(bidsData?.message ?? 'Could not load bids');

      setOwnBids(Array.isArray(bidsData?.ownBids) ? bidsData.ownBids : []);
      setBidHistory(Array.isArray(bidsData?.bidHistory) ? bidsData.bidHistory : []);
      setHighestBid(toNumeric(bidsData?.highestBid));
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load property');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPropertyAndBids();
  }, [id]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(''), 2500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  async function placeBid() {
    if (!id || !property || bidSubmitting) return;
    setBidMessage('');

    const parsedAmount = Number(amount);
    const latestHighest = toNumeric(highestBid);
    const validationError = getClientBidValidationError({ amount: parsedAmount, highestBid: latestHighest });
    if (validationError) {
      setBidMessage(validationError);
      return;
    }

    const previousState = {
      highestBid,
      ownBids,
      bidHistory,
    };

    // Optimistic UI: apply the submitted bid immediately.
    const optimisticTimestamp = new Date().toISOString();
    const optimistic = applyOptimisticBid({
      amount: parsedAmount,
      highestBid: latestHighest,
      ownBids,
      bidHistory,
      createdAtIso: optimisticTimestamp,
    });
    setAmount('');
    setHighestBid(optimistic.highestBid);
    setOwnBids(optimistic.ownBids);
    setBidHistory(optimistic.bidHistory);
    setBidMessage('Submitting bid...');

    try {
      setBidSubmitting(true);
      const res = await apiFetch(`/properties/${id}/bids`, { method: 'POST', body: JSON.stringify({ amount: parsedAmount }) });
      const data = await res.json();
      if (!res.ok) {
        setHighestBid(previousState.highestBid);
        setOwnBids(previousState.ownBids);
        setBidHistory(previousState.bidHistory);
        setBidMessage(data?.message ?? 'Bid failed');
        await safeNotificationHaptic();
        return;
      }

      setBidMessage('Bid submitted successfully');
      setToastMessage('Bid submitted');
      void loadPropertyAndBids();
      await safeNotificationHaptic();
    } catch {
      setHighestBid(previousState.highestBid);
      setOwnBids(previousState.ownBids);
      setBidHistory(previousState.bidHistory);
      setBidMessage('Could not submit bid');
      await safeNotificationHaptic();
    } finally {
      setBidSubmitting(false);
    }
  }

  async function requestAppointment() {
    if (!id) return;
    setAppointmentMessage('');
    try {
      setAppointmentSubmitting(true);
      const res = await apiFetch('/appointments/request', {
        method: 'POST',
        body: JSON.stringify({ propertyId: id, preferredStart: start, preferredEnd: end }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAppointmentMessage(data?.message ?? 'Appointment request failed');
        await safeNotificationHaptic();
        return;
      }
      setAppointmentMessage('Viewing request submitted');
      await safeImpactHaptic();
    } catch {
      setAppointmentMessage('Could not request appointment');
      await safeNotificationHaptic();
    } finally {
      setAppointmentSubmitting(false);
    }
  }

  async function editDraftListing() {
    if (!property || listingSubmitting) return;
    setListingMessage('');
    setError('');
    const title = editTitle.trim();
    const address = editAddress.trim();
    const description = editDescription.trim();
    const numericPrice = Number(editPriceGuide);
    const trimmedMinimum = editMinimumOffer.trim();
    const numericMinimum = trimmedMinimum ? Number(editMinimumOffer) : null;

    if (!title || !address || !description) {
      setListingMessage('Title, address and description are required');
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setListingMessage('Price must be a valid number');
      return;
    }
    if (trimmedMinimum && (!Number.isFinite(numericMinimum) || Number(numericMinimum) < 0)) {
      setListingMessage('Minimum offer must be a valid number');
      return;
    }

    try {
      setListingSubmitting(true);
      const res = await apiFetch(`/properties/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title,
          address,
          description,
          priceGuide: numericPrice,
          minimumOffer: numericMinimum,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setListingMessage(data?.message ?? 'Could not update listing');
        return;
      }
      setListingMessage('Listing updated');
      setToastMessage('Listing updated');
      setEditingDraft(false);
      await loadPropertyAndBids();
    } catch {
      setListingMessage('Could not update listing');
    } finally {
      setListingSubmitting(false);
    }
  }

  async function publishDraftListing() {
    if (!id || listingSubmitting) return;
    setListingMessage('');
    setError('');
    try {
      setListingSubmitting(true);
      let res = await apiFetch(`/properties/${id}/publish`, { method: 'POST' });
      let data = await res.json();
      if (!res.ok) {
        // Fallback for environments where the publish shortcut route fails.
        res = await apiFetch(`/properties/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'LIVE' }),
        });
        data = await res.json();
      }
      if (!res.ok) {
        setListingMessage(data?.message ?? data?.code ?? 'Could not publish listing');
        return;
      }
      setListingMessage('Listing published');
      setToastMessage('Listing published');
      setEditingDraft(false);
      await loadPropertyAndBids();
    } catch {
      setListingMessage('Could not publish listing');
    } finally {
      setListingSubmitting(false);
    }
  }

  async function shareListing() {
    if (!property || property.status !== 'LIVE') return;
    const message = `${property.title}\n${property.address}\nGuide: ${formatMoney(property.priceGuide)}`;
    try {
      await Share.share({ message });
    } catch {
      setListingMessage('Could not open share sheet');
    }
  }

  async function updateListingStatus(status: 'UNDER_OFFER' | 'SOLD', successMessage: string) {
    if (!property || listingSubmitting) return;
    setListingMessage('');
    setError('');
    try {
      setListingSubmitting(true);
      const res = await apiFetch(`/properties/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setListingMessage(data?.message ?? 'Could not update listing status');
        return;
      }
      setListingMessage(successMessage);
      setToastMessage(successMessage);
      await loadPropertyAndBids();
    } catch {
      setListingMessage('Could not update listing status');
    } finally {
      setListingSubmitting(false);
    }
  }

  async function deleteListing() {
    if (!id || listingSubmitting) return;
    setListingMessage('');
    setError('');
    try {
      setListingSubmitting(true);
      const res = await apiFetch(`/properties/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setListingMessage(data?.message ?? 'Could not delete listing');
        return;
      }
      setListingMessage('Listing deleted');
      setToastMessage('Listing deleted');
      router.replace('/(tabs)/properties');
    } catch {
      setListingMessage('Could not delete listing');
    } finally {
      setListingSubmitting(false);
    }
  }

  if (loading) return <Screen><Text>Loading...</Text></Screen>;
  if (!property) return <Screen><Text>{error || 'Property not found'}</Text></Screen>;

  const role = me?.role;
  const isBuyer = role === 'BUYER';
  const isStaff = role === 'AGENT' || role === 'TENANT_ADMIN';
  const canDelete = role === 'TENANT_ADMIN';
  const canBuyerActions = isBuyer && property.status === 'LIVE';
  const isListingSuccessMessage =
    listingMessage.includes('published') ||
    listingMessage.includes('updated') ||
    listingMessage.includes('agreed') ||
    listingMessage.includes('completed') ||
    listingMessage.includes('deleted');

  const minNextBid = highestBid !== null ? highestBid + 1 : 1;
  const ownLatestBid = ownBids.length ? ownBids[0] : null;
  const minimumOffer = toNumeric(property.minimumOffer);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {toastMessage ? (
          <Card style={{ marginBottom: 12, backgroundColor: '#E8F8EF' }}>
            <Text style={{ color: '#1E8E5A', fontWeight: '600' }}>{toastMessage}</Text>
          </Card>
        ) : null}
        <Card style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 28, fontWeight: '700' }}>{property.title}</Text>
          <Text style={{ marginTop: 8, color: '#5B5E66' }}>{property.address}</Text>
          <Text style={{ marginTop: 8, color: '#5B5E66' }}>{property.description}</Text>
          <Text style={{ marginTop: 8 }}>Guide: {formatMoney(property.priceGuide)}</Text>
          {isStaff ? <Text style={{ marginTop: 4 }}>Minimum offer: {minimumOffer !== null ? formatMoney(minimumOffer) : '-'}</Text> : null}
          <Text style={{ marginTop: 4 }}>Status: {property.status}</Text>
          <Text style={{ marginTop: 4 }}>Bidding: {property.biddingMode}</Text>
          <Text style={{ marginTop: 4 }}>Min increment: {formatMoney(property.minIncrement)}</Text>
          <Text style={{ marginTop: 4 }}>Deadline: {formatDate(property.biddingDeadline)}</Text>
        </Card>

        {canBuyerActions ? (
          <Card style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>Bid Snapshot</Text>
            <Text>Highest bid: {formatMoney(highestBid)}</Text>
            <Text style={{ marginTop: 4 }}>Minimum next bid: {formatMoney(minNextBid)}</Text>
            <Text style={{ marginTop: 4 }}>
              Your latest bid: {ownLatestBid ? formatMoney(ownLatestBid.amount) : '-'}
            </Text>
            <Text style={{ marginTop: 8, fontWeight: '600' }}>Recent bid history</Text>
            {bidHistory.length ? (
              bidHistory.slice(0, 5).map((row: any, idx: number) => (
                <Text key={`${row.createdAt}-${idx}`} style={{ marginTop: 4, color: '#5B5E66' }}>
                  {row.bidder}: {formatMoney(row.amount)} at {formatDate(row.createdAt)}
                </Text>
              ))
            ) : (
              <Text style={{ marginTop: 4, color: '#5B5E66' }}>No bid history yet</Text>
            )}
          </Card>
        ) : null}

        {canBuyerActions ? (
          <Card style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>Submit Bid ({property.biddingMode})</Text>
            <InlineInput value={amount} onChangeText={setAmount} placeholder="Amount" />
            <View style={{ height: 8 }} />
            <Text style={{ color: '#5B5E66' }}>
              {highestBid !== null
                ? `Current highest offer is ${formatMoney(highestBid)}. Enter a higher offer.`
                : 'Enter your offer amount'}
            </Text>
            {bidMessage ? <Text style={{ marginTop: 8, color: bidMessage.includes('success') ? '#30B07A' : '#D64545' }}>{bidMessage}</Text> : null}
            <View style={{ height: 10 }} />
            <Button label={bidSubmitting ? 'Submitting...' : 'Submit Bid'} onPress={placeBid} disabled={bidSubmitting} />
          </Card>
        ) : null}

        {canBuyerActions ? (
          <Card style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>Request Viewing</Text>
            <InlineInput value={start} onChangeText={setStart} placeholder="Start ISO" />
            <View style={{ height: 8 }} />
            <InlineInput value={end} onChangeText={setEnd} placeholder="End ISO" />
            {appointmentMessage ? (
              <Text style={{ marginTop: 8, color: appointmentMessage.includes('submitted') ? '#30B07A' : '#D64545' }}>
                {appointmentMessage}
              </Text>
            ) : null}
            <View style={{ height: 10 }} />
            <Button
              label={appointmentSubmitting ? 'Submitting...' : 'Request Appointment'}
              onPress={requestAppointment}
              disabled={appointmentSubmitting}
            />
          </Card>
        ) : null}

        {isStaff && property.status === 'DRAFT' ? (
          <Card style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>Listing Actions</Text>
            {listingMessage ? <Text style={{ marginBottom: 8, color: isListingSuccessMessage ? '#30B07A' : '#D64545' }}>{listingMessage}</Text> : null}
            {!editingDraft ? (
              <Button label="Edit Listing" onPress={() => setEditingDraft(true)} disabled={listingSubmitting} />
            ) : (
              <View>
                <Text style={{ fontWeight: '600' }}>Title</Text>
                <InlineInput value={editTitle} onChangeText={setEditTitle} placeholder="Title" />
                <View style={{ height: 8 }} />
                <Text style={{ fontWeight: '600' }}>Address</Text>
                <InlineInput value={editAddress} onChangeText={setEditAddress} placeholder="Address (line 1, line 2)" multiline />
                <View style={{ height: 8 }} />
                <Text style={{ fontWeight: '600' }}>Description</Text>
                <InlineInput value={editDescription} onChangeText={setEditDescription} placeholder="Description" multiline />
                <View style={{ height: 8 }} />
                <Text style={{ fontWeight: '600' }}>Price Guide</Text>
                <InlineInput value={editPriceGuide} onChangeText={setEditPriceGuide} keyboardType="numeric" placeholder="Price guide" />
                <View style={{ height: 8 }} />
                <Text style={{ fontWeight: '600' }}>Minimum Offer (staff only)</Text>
                <InlineInput
                  value={editMinimumOffer}
                  onChangeText={setEditMinimumOffer}
                  keyboardType="numeric"
                  placeholder="Optional minimum offer"
                />
                <View style={{ height: 8 }} />
                <Button label={listingSubmitting ? 'Saving...' : 'Save Draft Changes'} onPress={editDraftListing} disabled={listingSubmitting} />
                <View style={{ height: 8 }} />
                <Button label="Cancel Edit" onPress={() => setEditingDraft(false)} style={{ backgroundColor: '#8B9099' }} disabled={listingSubmitting} />
              </View>
            )}
            <View style={{ height: 8 }} />
            <Button label={listingSubmitting ? 'Publishing...' : 'Publish Listing'} onPress={publishDraftListing} disabled={listingSubmitting} />
          </Card>
        ) : null}

        {isStaff && property.status !== 'DRAFT' ? (
          <Card style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>Listing Actions</Text>
            {listingMessage ? <Text style={{ marginBottom: 8, color: isListingSuccessMessage ? '#30B07A' : '#D64545' }}>{listingMessage}</Text> : null}
            {!editingDraft ? (
              <Button label="Edit Listing" onPress={() => setEditingDraft(true)} disabled={listingSubmitting} />
            ) : (
              <View>
                <Text style={{ fontWeight: '600' }}>Title</Text>
                <InlineInput value={editTitle} onChangeText={setEditTitle} placeholder="Title" />
                <View style={{ height: 8 }} />
                <Text style={{ fontWeight: '600' }}>Address</Text>
                <InlineInput value={editAddress} onChangeText={setEditAddress} placeholder="Address (line 1, line 2)" multiline />
                <View style={{ height: 8 }} />
                <Text style={{ fontWeight: '600' }}>Description</Text>
                <InlineInput value={editDescription} onChangeText={setEditDescription} placeholder="Description" multiline />
                <View style={{ height: 8 }} />
                <Text style={{ fontWeight: '600' }}>Price Guide</Text>
                <InlineInput value={editPriceGuide} onChangeText={setEditPriceGuide} keyboardType="numeric" placeholder="Price guide" />
                <View style={{ height: 8 }} />
                <Text style={{ fontWeight: '600' }}>Minimum Offer (staff only)</Text>
                <InlineInput
                  value={editMinimumOffer}
                  onChangeText={setEditMinimumOffer}
                  keyboardType="numeric"
                  placeholder="Optional minimum offer"
                />
                <View style={{ height: 8 }} />
                <Button label={listingSubmitting ? 'Saving...' : 'Save Changes'} onPress={editDraftListing} disabled={listingSubmitting} />
                <View style={{ height: 8 }} />
                <Button label="Cancel Edit" onPress={() => setEditingDraft(false)} style={{ backgroundColor: '#8B9099' }} disabled={listingSubmitting} />
              </View>
            )}
            <View style={{ height: 8 }} />
            {property.status === 'LIVE' ? (
              <>
                <Button
                  label={listingSubmitting ? 'Updating...' : 'Sale Agreed'}
                  onPress={() =>
                    Alert.alert('Mark Sale Agreed', 'Move this listing to UNDER_OFFER?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Confirm', onPress: () => void updateListingStatus('UNDER_OFFER', 'Sale marked as agreed') },
                    ])
                  }
                  disabled={listingSubmitting}
                />
                <View style={{ height: 8 }} />
              </>
            ) : null}
            {property.status === 'UNDER_OFFER' ? (
              <>
                <Button
                  label={listingSubmitting ? 'Updating...' : 'Complete'}
                  onPress={() =>
                    Alert.alert('Complete Sale', 'Mark this listing as SOLD?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Confirm', onPress: () => void updateListingStatus('SOLD', 'Sale completed') },
                    ])
                  }
                  disabled={listingSubmitting}
                />
                <View style={{ height: 8 }} />
              </>
            ) : null}
            {canDelete ? (
              <Button
                label={listingSubmitting ? 'Deleting...' : 'Delete Listing'}
                onPress={() =>
                  Alert.alert('Delete Listing', 'Delete this listing? This cannot be undone.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => void deleteListing() },
                  ])
                }
                disabled={listingSubmitting}
                style={{ backgroundColor: '#B73A3A' }}
              />
            ) : null}
          </Card>
        ) : null}

        {property.status === 'LIVE' ? (
          <Card style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>Share Listing</Text>
            <Button label="Share Published Listing" onPress={shareListing} />
          </Card>
        ) : null}

        <Button label="Open Messages" onPress={() => router.push(`/(tabs)/thread/${id}`)} />
      </ScrollView>
    </Screen>
  );
}
