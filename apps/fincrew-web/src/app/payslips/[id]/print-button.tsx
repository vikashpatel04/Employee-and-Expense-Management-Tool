'use client';

import { useEffect } from 'react';
import { Printer } from 'lucide-react';

/**
 * Opens the browser's print dialog; "Save as PDF" there gives the PDF. While printing (this
 * button or Ctrl+P) the page switches to the light theme, so dark mode never prints light text
 * on white paper, and the page title becomes `fileName`, which browsers offer as the PDF's name.
 */
export function PrintButton({ label, fileName }: { label: string; fileName: string }) {
  useEffect(() => {
    const root = document.documentElement;
    let before: string | undefined;
    let title = document.title;
    const onBefore = () => {
      before = root.dataset.theme;
      root.dataset.theme = 'light';
      title = document.title;
      document.title = fileName;
    };
    const onAfter = () => {
      if (before === undefined) delete root.dataset.theme;
      else root.dataset.theme = before;
      document.title = title;
    };
    window.addEventListener('beforeprint', onBefore);
    window.addEventListener('afterprint', onAfter);
    return () => {
      window.removeEventListener('beforeprint', onBefore);
      window.removeEventListener('afterprint', onAfter);
    };
  }, [fileName]);

  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="text-label-sm inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-[var(--on-accent)]"
    >
      <Printer size={20} aria-hidden="true" />
      {label}
    </button>
  );
}
