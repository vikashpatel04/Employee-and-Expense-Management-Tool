'use client';

import { useFormAction } from '@/lib/use-form-action';
import { buttonClass, inputClass } from '../components';
import { signIn, type SignInState } from './actions';

type Labels = { email: string; password: string; signIn: string; signingIn: string };

export function LoginForm({ labels }: { labels: Labels }) {
  const [state, onSubmit, pending] = useFormAction<SignInState>(signIn, {});

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="text-label-sm block">
        {labels.email}
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </label>
      <label className="text-label-sm block">
        {labels.password}
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </label>
      {state.error && (
        <p role="alert" className="text-body text-[var(--danger)]">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? labels.signingIn : labels.signIn}
      </button>
    </form>
  );
}
