'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

const nav = [
  { href: '/properties', label: 'Properties' },
  { href: '/appointments', label: 'Appointments' },
  { href: '/bids', label: 'Bids' },
  { href: '/users', label: 'Users' },
  { href: '/buyers', label: 'Buyers' },
  { href: '/branding', label: 'Branding' },
  { href: '/settings', label: 'Settings' },
  { href: '/audit', label: 'Audit' },
  { href: '/super-admin', label: 'Super Admin' },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();

  return (
    <main className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Estate Admin</h1>
        <button
          onClick={() => {
            localStorage.clear();
            router.push('/login');
          }}
        >
          Logout
        </button>
      </div>
      <nav className="nav">
        {nav.map((item) => (
          <Link key={item.href} href={item.href} style={{ background: path === item.href ? '#e9f1ff' : '#fff' }}>
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </main>
  );
}
