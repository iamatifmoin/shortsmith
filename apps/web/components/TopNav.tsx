'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Shared header: brand + nav. Brand is read from the active channel config. */
export default function TopNav({ children }: { children?: React.ReactNode }) {
  const path = usePathname() ?? '/';
  const [brand, setBrand] = useState<{ name: string; logo: string | null }>({
    name: 'Shortsmith',
    logo: null,
  });

  useEffect(() => {
    let active = true;
    fetch('/api/channel', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (active && c) {
          setBrand({ name: c.displayName || c.name || 'Shortsmith', logo: c.logoPath ?? null });
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const onReview = path === '/';
  const onPublish = path.startsWith('/publish');
  const onPerformance = path.startsWith('/performance');
  const onSetup = path.startsWith('/setup');

  return (
    <header className="topbar">
      <span className="brand">
        {brand.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logo} alt="" />
        ) : null}
        {brand.name}
      </span>
      <nav className="nav">
        <a className={onReview ? 'active' : ''} href="/">
          Review
        </a>
        <a className={onPublish ? 'active' : ''} href="/publish">
          Publish
        </a>
        <a className={onPerformance ? 'active' : ''} href="/performance">
          Performance
        </a>
        <a className={onSetup ? 'active' : ''} href="/setup">
          Setup
        </a>
      </nav>
      <span className="spacer" />
      {children}
    </header>
  );
}
