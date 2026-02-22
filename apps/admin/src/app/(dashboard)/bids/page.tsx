'use client';

import { useEffect, useState } from 'react';
import { DashboardShell } from '../../../components/DashboardShell';
import { authedFetch } from '../../../components/clientApi';

export default function BidsPage() {
  const [properties, setProperties] = useState<any[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');

  async function loadProperties() {
    const res = await authedFetch('/properties');
    const data = await res.json();
    if (!res.ok) {
      setError(data?.message ?? 'Could not load properties');
      return;
    }
    setProperties(Array.isArray(data) ? data : []);
  }

  async function load() {
    if (!propertyId) return;
    const res = await authedFetch(`/properties/${propertyId}/bids`);
    const data = await res.json();
    if (!res.ok) {
      setRows([]);
      setError(data?.message ?? 'Could not load bids');
      return;
    }
    setRows(Array.isArray(data) ? data : []);
    setError('');
  }

  async function exportCsv() {
    const csv = ['bidId,amount,buyer,createdAt', ...rows.map((r) => `${r.id},${r.amount},${r.buyer?.name ?? ''},${r.createdAt}`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bids-${propertyId}.csv`;
    a.click();
  }

  async function acceptOffer(bidId: string) {
    const ok = window.confirm('Accept this offer and mark listing as UNDER_OFFER?');
    if (!ok) return;

    const res = await authedFetch(`/properties/${propertyId}/accept-offer/${bidId}`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.message ?? 'Could not accept offer');
      return;
    }
    await load();
    await loadProperties();
  }

  async function closeBidding() {
    const ok = window.confirm('Close bidding for this listing?');
    if (!ok) return;

    const res = await authedFetch(`/properties/${propertyId}/close-bidding`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.message ?? 'Could not close bidding');
      return;
    }
    await load();
    await loadProperties();
  }

  useEffect(() => {
    void loadProperties();
  }, []);

  return (
    <DashboardShell>
      <section className="card grid">
        <h3>Property Bids</h3>
        {error ? <p style={{ color: '#c23838' }}>{error}</p> : null}
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          <option value="">Select property</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} ({p.status})
            </option>
          ))}
        </select>
        <div>
          <button onClick={load}>Load Bids</button>{' '}
          <button onClick={closeBidding} style={{ background: '#A56712' }}>Close Bidding</button>{' '}
          <button onClick={exportCsv} style={{ background: '#2F8B61' }}>Export CSV</button>
        </div>
        <table className="table">
          <thead><tr><th>Bid</th><th>Amount</th><th>Buyer</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{Number(r.amount).toLocaleString()}</td>
                <td>{r.buyer?.name}</td>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td><button onClick={() => void acceptOffer(r.id)}>Accept Offer</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </DashboardShell>
  );
}
