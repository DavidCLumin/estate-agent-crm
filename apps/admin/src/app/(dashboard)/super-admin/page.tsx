'use client';

import { useEffect, useState } from 'react';
import { DashboardShell } from '../../../components/DashboardShell';
import { authedFetch } from '../../../components/clientApi';

export default function SuperAdminPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');

  async function load() {
    const res = await authedFetch('/super/tenants');
    setRows(await res.json());
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await authedFetch('/super/tenants', { method: 'POST', body: JSON.stringify({ name, key }) });
    setName('');
    setKey('');
    load();
  }

  useEffect(() => { load().catch(() => undefined); }, []);

  return (
    <DashboardShell>
      <div className="grid grid-2">
        <section className="card">
          <h3>Create Tenant</h3>
          <form className="grid" onSubmit={create}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tenant name" required />
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Tenant key" required />
            <button type="submit">Create</button>
          </form>
        </section>
        <section className="card">
          <h3>Tenant Metrics</h3>
          <table className="table">
            <thead><tr><th>Name</th><th>Users</th><th>Properties</th><th>Bids</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r._count.users}</td><td>{r._count.properties}</td><td>{r._count.bids}</td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </DashboardShell>
  );
}
