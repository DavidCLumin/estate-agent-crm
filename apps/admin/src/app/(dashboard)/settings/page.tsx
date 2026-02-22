'use client';

import { useEffect, useState } from 'react';
import { DashboardShell } from '../../../components/DashboardShell';
import { authedFetch } from '../../../components/clientApi';

type SettingsPayload = {
  testModeEnabled: boolean;
  emailTemplates?: {
    viewingRequestSubject?: string;
    viewingApprovedSubject?: string;
    offerReceivedSubject?: string;
  };
};

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [testModeEnabled, setTestModeEnabled] = useState(false);
  const [viewingRequestSubject, setViewingRequestSubject] = useState('Viewing request submitted');
  const [viewingApprovedSubject, setViewingApprovedSubject] = useState('Viewing approved');
  const [offerReceivedSubject, setOfferReceivedSubject] = useState('Offer received');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await authedFetch('/tenants/settings');
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? 'Could not load settings');
        return;
      }
      setTestModeEnabled(Boolean(data?.testModeEnabled));
      setViewingRequestSubject(data?.emailTemplates?.viewingRequestSubject ?? 'Viewing request submitted');
      setViewingApprovedSubject(data?.emailTemplates?.viewingApprovedSubject ?? 'Viewing approved');
      setOfferReceivedSubject(data?.emailTemplates?.offerReceivedSubject ?? 'Offer received');
    } catch {
      setError('Could not load settings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setMessage('');

    const payload: SettingsPayload = {
      testModeEnabled,
      emailTemplates: {
        viewingRequestSubject,
        viewingApprovedSubject,
        offerReceivedSubject,
      },
    };

    try {
      const res = await authedFetch('/tenants/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? 'Could not save settings');
        return;
      }
      setMessage('Settings saved');
    } catch {
      setError('Could not save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell>
      <section className="card" style={{ maxWidth: 760 }}>
        <h3>Settings</h3>
        {loading ? <p>Loading...</p> : null}
        {error ? <p style={{ color: '#c23838' }}>{error}</p> : null}
        {message ? <p style={{ color: '#2F8B61' }}>{message}</p> : null}

        <form className="grid" onSubmit={save}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={testModeEnabled} onChange={(e) => setTestModeEnabled(e.target.checked)} />
            Enable tenant test mode
          </label>

          <h4 style={{ marginBottom: 0 }}>Email Templates (subjects)</h4>
          <input
            value={viewingRequestSubject}
            onChange={(e) => setViewingRequestSubject(e.target.value)}
            placeholder="Viewing request submitted"
          />
          <input
            value={viewingApprovedSubject}
            onChange={(e) => setViewingApprovedSubject(e.target.value)}
            placeholder="Viewing approved"
          />
          <input
            value={offerReceivedSubject}
            onChange={(e) => setOfferReceivedSubject(e.target.value)}
            placeholder="Offer received"
          />

          <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
        </form>
      </section>
    </DashboardShell>
  );
}
