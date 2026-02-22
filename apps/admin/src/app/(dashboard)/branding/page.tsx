'use client';

import { useState } from 'react';
import { DashboardShell } from '../../../components/DashboardShell';
import { authedFetch } from '../../../components/clientApi';

export default function BrandingPage() {
  const [logoUrl, setLogoUrl] = useState('https://placehold.co/120x120');
  const [primaryColor, setPrimaryColor] = useState('#1E6BFF');
  const [secondaryColor, setSecondaryColor] = useState('#30B07A');

  async function save() {
    await authedFetch('/tenants/branding', {
      method: 'PUT',
      body: JSON.stringify({
        logoUrl,
        primaryColor,
        secondaryColor,
        neutralPalette: { bg: '#F5F7FA', text: '#0A0A0A' },
        cornerRadius: 14,
        spacingScale: { base: 8 },
      }),
    });
    alert('Saved');
  }

  return (
    <DashboardShell>
      <section className="card grid" style={{ maxWidth: 580 }}>
        <h3>Tenant Branding</h3>
        <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="Logo URL" />
        <input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} placeholder="Primary color" />
        <input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} placeholder="Secondary color" />
        <button onClick={save}>Save Branding</button>
      </section>
    </DashboardShell>
  );
}
