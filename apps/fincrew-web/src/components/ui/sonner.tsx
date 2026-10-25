'use client';

import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';

/** Toasts for "Saved", "Paid" and errors; light / dark follow the device like the tokens do. */
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="system"
    className="toaster group"
    icons={{
      success: <CircleCheckIcon className="size-4 text-[var(--status-present)]" />,
      info: <InfoIcon className="size-4" />,
      warning: <TriangleAlertIcon className="size-4 text-[var(--status-late)]" />,
      error: <OctagonXIcon className="size-4 text-[var(--danger)]" />,
      loading: <Loader2Icon className="size-4 animate-spin" />,
    }}
    style={
      {
        '--normal-bg': 'var(--surface)',
        '--normal-text': 'var(--ink)',
        '--normal-border': 'var(--line)',
        '--border-radius': '10px',
      } as CSSProperties
    }
    {...props}
  />
);

export { Toaster };
