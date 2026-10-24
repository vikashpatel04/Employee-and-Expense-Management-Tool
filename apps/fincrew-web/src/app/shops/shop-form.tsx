'use client';

import { useFormAction } from '@/lib/use-form-action';
import { buttonClass, inputClass } from '../components';
import { createShop, type CreateShopState } from './actions';

type Labels = { shopName: string; yourName: string; create: string; creating: string };

export function ShopForm({ labels, ownerName }: { labels: Labels; ownerName?: string }) {
  const [state, onSubmit, pending] = useFormAction<CreateShopState>(createShop, {});

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
