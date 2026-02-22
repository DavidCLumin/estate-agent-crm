'use client';

import { useState } from 'react';
import { API_URL, authHeaders } from '../../../components/api';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@acme.local');
  const [password, setPassword] = useState('Passw0rd!');
  const [tenantId, setTenantId] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: authHeaders(undefined, undefined, true),
      body: JSON.stringify({ email, password, tenantId: tenantId || undefined }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.message ?? 'Login failed');

    localStorage.setItem('estate_access_token', data.accessToken);
    localStorage.setItem('estate_refresh_token', data.refreshToken);
    localStorage.setItem('estate_tenant_id', data.user.tenantId ?? '');
    localStorage.setItem('estate_role', data.user.role);
    router.push('/properties');
  }

  return (
    <main className="container" style={{ maxWidth: 460, marginTop: 80 }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Admin Sign In</h1>
        <p style={{ color: 'var(--subtext)' }}>Tenant-aware estate dashboard</p>
        <form onSubmit={submit} className="grid">
          <input aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <input aria-label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
          <input aria-label="Tenant ID" value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="Tenant ID (optional for super admin)" />
          {error ? <p style={{ color: '#c23838', margin: 0 }}>{error}</p> : null}
          <button type="submit">Sign In</button>
        </form>
      </div>
    </main>
  );
}
