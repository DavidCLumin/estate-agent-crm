'use client';

import { useEffect, useState } from 'react';
import { DashboardShell } from '../../../components/DashboardShell';
import { authedFetch } from '../../../components/clientApi';

export default function AppointmentsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');

  async function load() {
    const res = await authedFetch('/appointments');
    const data = await res.json();
    if (!res.ok) {
      setRows([]);
      setError(data?.message ?? 'Could not load appointments');
      return;
    }
    setError('');
    setRows(Array.isArray(data) ? data : []);
  }

  async function update(id: string, action: 'approve' | 'decline' | 'cancel' | 'complete') {
    const ok = window.confirm(`Confirm ${action} for this appointment?`);
    if (!ok) return;
    const body = action === 'complete' ? JSON.stringify({}) : undefined;
    const res = await authedFetch(`/appointments/${id}/${action}`, { method: 'POST', body });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.message ?? `Could not ${action} appointment`);
      return;
    }
    load();
  }

  useEffect(() => { load(); }, []);

  return (
    <DashboardShell>
      <section className="card">
        <h3>Appointment Queue</h3>
        {error ? <p style={{ color: '#c23838' }}>{error}</p> : null}
        <table className="table">
          <thead><tr><th>ID</th><th>Property</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.property?.title}</td>
                <td>{r.status}</td>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td>
                  <button onClick={() => update(r.id, 'approve')}>Approve</button>{' '}
                  <button onClick={() => update(r.id, 'decline')} style={{ background: '#D64545' }}>Decline</button>
                  {' '}
                  <button onClick={() => update(r.id, 'complete')} style={{ background: '#2F8B61' }}>Complete</button>
                  {' '}
                  <button onClick={() => update(r.id, 'cancel')} style={{ background: '#8B9099' }}>Cancel</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </DashboardShell>
  );
}
