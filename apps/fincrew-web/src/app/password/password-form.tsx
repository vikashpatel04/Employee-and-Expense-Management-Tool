'use client';

import { useFormAction } from '@/lib/use-form-action';
import { buttonClass, inputClass } from '../components';
import { choosePassword, type PasswordState } from './actions';

type Labels = { password: string; again: string; save: string; saving: string };

export function PasswordForm({ labels }: { labels: Labels }) {
  const [state, onSubmit, pending] = useFormAction<PasswordState>(choosePassword, {});
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="text-label-sm block">
        {labels.password}
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </label>
      <label className="text-label-sm block">
        {labels.again}
        <input
          name="again"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </label>
      {state.error && (
        <p role="alert" className="text-body text-[var(--danger)]">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass}>
        {pending ? labels.saving : labels.save}
      </button>
    </form>
  );
}
