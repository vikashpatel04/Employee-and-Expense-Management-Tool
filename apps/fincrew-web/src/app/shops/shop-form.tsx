'use client';

import { useActionState } from 'react';
import { buttonClass, inputClass } from '../components';
import { createShop, type CreateShopState } from './actions';

type Labels = { shopName: string; yourName: string; create: string; creating: string };

export function ShopForm({ labels, ownerName }: { labels: Labels; ownerName?: string }) {
  const [state, action, pending] = useActionState<CreateShopState, FormData>(createShop, {});

  return (
    <form action={action} className="space-y-4">
      <label className="text-label-sm block">
        {labels.shopName}
        <input name="shopName" required maxLength={120} className={inputClass} />
      </label>
      <label className="text-label-sm block">
        {labels.yourName}
        <input
          name="ownerName"
          required
          maxLength={120}
          autoComplete="name"
          defaultValue={ownerName}
          className={inputClass}
        />
      </label>
      {state.error && (
        <p role="alert" className="text-body text-[var(--danger)]">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? labels.creating : labels.create}
      </button>
    </form>
  );
}
