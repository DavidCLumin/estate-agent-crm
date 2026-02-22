'use client';

import { useEffect, useState } from 'react';
import { DashboardShell } from '../../../components/DashboardShell';
import { authedFetch } from '../../../components/clientApi';

export default function BuyersPage() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { authedFetch('/buyers').then((r) => r.json()).then(setRows); }, []);

  return (
    <DashboardShell>
      <section className="card">
        <h3>Buyers</h3>
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Verified</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><td>{r.name}</td><td>{r.email}</td><td>{r.emailVerifiedAt ? 'Yes' : 'No'}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </DashboardShell>
  );
}
