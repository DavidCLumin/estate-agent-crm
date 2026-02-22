'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '../../../components/DashboardShell';
import { authedFetch } from '../../../components/clientApi';

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: 'TENANT_ADMIN' | 'AGENT' | 'BUYER';
  deletedAt: string | null;
  createdAt: string;
  emailVerifiedAt: string | null;
};

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [roleFilter, setRoleFilter] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'AGENT' | 'BUYER'>('AGENT');
  const [saving, setSaving] = useState(false);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (roleFilter) q.set('role', roleFilter);
    if (includeInactive) q.set('includeInactive', 'true');
    const value = q.toString();
    return value ? `?${value}` : '';
  }, [roleFilter, includeInactive]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authedFetch(`/users${query}`);
      const data = await res.json();
      if (!res.ok) {
        setRows([]);
        setError(data?.message ?? 'Could not load users');
        return;
      }
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load users');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await authedFetch('/users', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? 'Could not create user');
        return;
      }

      setName('');
      setEmail('');
      setPassword('');
      setRole('AGENT');
      await load();
    } catch {
      setError('Could not create user');
    } finally {
      setSaving(false);
    }
  }

  async function setActive(user: UserRow, active: boolean) {
    const actionText = active ? 'reactivate' : 'deactivate';
    const ok = window.confirm(`Are you sure you want to ${actionText} ${user.name}?`);
    if (!ok) return;

    try {
      const res = await authedFetch(`/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data?.message ?? `Could not ${actionText} user`);
        return;
      }
      await load();
    } catch {
      setError(`Could not ${actionText} user`);
    }
  }

  return (
    <DashboardShell>
      <div className="grid grid-2">
        <section className="card">
          <h3>Create User</h3>
          <form className="grid" onSubmit={createUser}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required />
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" required />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Temporary password" required />
            <select value={role} onChange={(e) => setRole(e.target.value as 'AGENT' | 'BUYER')}>
              <option value="AGENT">AGENT</option>
              <option value="BUYER">BUYER</option>
            </select>
            <button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create User'}</button>
          </form>
        </section>

        <section className="card">
          <h3>Users</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All roles</option>
              <option value="TENANT_ADMIN">TENANT_ADMIN</option>
              <option value="AGENT">AGENT</option>
              <option value="BUYER">BUYER</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} /> Include inactive
            </label>
            <button onClick={() => void load()} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
          </div>

          {error ? <p style={{ color: '#c23838' }}>{error}</p> : null}

          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Verified</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => {
                const active = !user.deletedAt;
                return (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td>{user.emailVerifiedAt ? 'Yes' : 'No'}</td>
                    <td>{active ? 'Active' : 'Inactive'}</td>
                    <td>
                      {active ? (
                        <button style={{ background: '#D64545' }} onClick={() => void setActive(user, false)}>Deactivate</button>
                      ) : (
                        <button style={{ background: '#2F8B61' }} onClick={() => void setActive(user, true)}>Reactivate</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </DashboardShell>
  );
}
