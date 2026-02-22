'use client';

import { useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '../../../components/DashboardShell';
import { authedFetch } from '../../../components/clientApi';

export default function AuditPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [action, setAction] = useState('');

  const load = useCallback(async () => {
    const query = action ? `?action=${encodeURIComponent(action)}` : '';
    const res = await authedFetch(`/audit-logs${query}`);
    setRows(await res.json());
  }, [action]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardShell>
      <section className="card grid">
        <h3>Audit Log</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Filter action" />
          <button onClick={load}>Filter</button>
        </div>
        <table className="table">
          <thead><tr><th>Action</th><th>Entity</th><th>User</th><th>Date</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td>{r.action}</td><td>{r.entity}</td><td>{r.userId ?? '-'}</td><td>{new Date(r.createdAt).toLocaleString()}</td></tr>)}</tbody>
        </table>
      </section>
    </DashboardShell>
  );
}
