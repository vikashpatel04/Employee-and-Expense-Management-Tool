import type { Metadata } from 'next';
import { Anek_Latin } from 'next/font/google';
import type { ReactNode } from 'react';
import { NavProgress } from '@/components/app/pending-link';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { t } from '@/lib/i18n';
import '@fincrew/ui/tokens.css';
import './globals.css';

// The design system's typeface. Tamil and Devanagari faces load with translations (Phase 8).
const anek = Anek_Latin({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-anek-latin',
  display: 'swap',
});

export const metadata: Metadata = {
  title: t('appName'),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={anek.variable}>
      <body className="min-h-dvh text-sm antialiased">
        <NavProgress />
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
