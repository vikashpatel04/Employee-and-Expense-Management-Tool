'use client';

import type { ComponentProps } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * Submit button for a plain `<form action={…}>` or a `next/form` search: busy (spinner, see
 * globals.css `aria-busy`) and disabled while the form's action or the next page is loading.
 */
export function FormSubmit({ disabled, ...props }: ComponentProps<'button'>) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending || disabled} aria-busy={pending} {...props} />;
}
