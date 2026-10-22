import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { t } from '@/lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: t('appName'),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
