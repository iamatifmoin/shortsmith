import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Shortsmith · Script Review',
  description: 'Human Gate 1 — review, edit, approve or reject generated scripts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
