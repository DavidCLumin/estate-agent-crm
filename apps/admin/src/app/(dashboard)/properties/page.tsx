'use client';

import { useEffect, useState } from 'react';
import { DashboardShell } from '../../../components/DashboardShell';
import { authedFetch } from '../../../components/clientApi';

export default function PropertiesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ title: '', address: '', description: '', priceGuide: 0, biddingMode: 'OPEN' });
  const [error, setError] = useState('');

  async function load() {
    const res = await authedFetch('/properties');
    const data = await res.json();
    if (!res.ok) {
      setRows([]);
      setError(data?.message ?? 'Could not load properties');
      return;
    }
    setError('');
    setRows(Array.isArray(data) ? data : []);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await authedFetch('/properties', {
      method: 'POST',
      body: JSON.stringify({ ...form, status: 'DRAFT', minIncrement: 1000 }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.message ?? 'Could not create property');
      return;
    }
    setForm({ title: '', address: '', description: '', priceGuide: 0, biddingMode: 'OPEN' });
    load();
  }

  async function lifecycle(id: string, action: 'publish' | 'under_offer' | 'sold' | 'delete') {
    const confirmText = {
      publish: 'Publish this listing?',
      under_offer: 'Mark this listing as UNDER_OFFER?',
      sold: 'Mark this listing as SOLD?',
      delete: 'Delete this listing?',
    }[action];
    if (!window.confirm(confirmText)) return;

    if (action === 'publish') {
      const res = await authedFetch(`/properties/${id}/publish`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? 'Could not publish');
        return;
      }
      void load();
      return;
    }

    if (action === 'delete') {
      const res = await authedFetch(`/properties/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? 'Could not delete');
        return;
      }
      void load();
      return;
    }

    const status = action === 'under_offer' ? 'UNDER_OFFER' : 'SOLD';
    const res = await authedFetch(`/properties/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.message ?? 'Could not update status');
      return;
    }
    void load();
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <DashboardShell>
      <div className="grid grid-2">
        <section className="card">
          <h3>Create Property</h3>
          <form className="grid" onSubmit={create}>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" required />
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" required />
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" required />
            <input type="number" value={form.priceGuide} onChange={(e) => setForm({ ...form, priceGuide: Number(e.target.value) })} placeholder="Price guide" required />
            <select value={form.biddingMode} onChange={(e) => setForm({ ...form, biddingMode: e.target.value })}>
              <option value="OPEN">OPEN</option>
              <option value="SEALED">SEALED</option>
            </select>
            <button type="submit">Create</button>
          </form>
        </section>
        <section className="card">
          <h3>Properties</h3>
          {error ? <p style={{ color: '#c23838' }}>{error}</p> : null}
          <table className="table">
            <thead>
              <tr><th>Title</th><th>Status</th><th>Guide</th><th>Mode</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.title}</td>
                  <td><span className="badge">{r.status}</span></td>
                  <td>{Number(r.priceGuide).toLocaleString()}</td>
                  <td>{r.biddingMode}</td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => void lifecycle(r.id, 'publish')}>Publish</button>
                    <button onClick={() => void lifecycle(r.id, 'under_offer')} style={{ background: '#A56712' }}>Sale Agreed</button>
                    <button onClick={() => void lifecycle(r.id, 'sold')} style={{ background: '#2F8B61' }}>Complete</button>
                    <button onClick={() => void lifecycle(r.id, 'delete')} style={{ background: '#D64545' }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </DashboardShell>
  );
}
