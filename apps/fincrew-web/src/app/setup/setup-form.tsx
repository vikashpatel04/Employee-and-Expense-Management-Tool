'use client';

import { useActionState } from 'react';
import { buttonClass, inputClass } from '../components';
import { setupShop, type SetupState } from './actions';

type Labels = { shopName: string; yourName: string; create: string; creating: string };

export function SetupForm({ labels }: { labels: Labels }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(setupShop, {});

  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm">
        {labels.shopName}
        <input name="shopName" required maxLength={120} className={inputClass} />
      </label>
      <label className="block text-sm">
        {labels.yourName}
        <input
          name="ownerName"
          required
          maxLength={120}
          autoComplete="name"
          className={inputClass}
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? labels.creating : labels.create}
      </button>
    </form>
  );
}
