'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CATEGORY_COLOURS, CATEGORY_ICONS } from '@/lib/expense-style';
import { t } from '@/lib/i18n';
import { useFormAction } from '@/lib/use-form-action';
import { buttonClass, inputClass, quietButtonClass } from '../../../components';
import { FormMessage } from '../holidays/holiday-forms';
import { addSuggested, saveCategory, setCategoryArchived, type CategoryState } from './actions';

const c = 'settings.categories';
const pick =
  'grid h-11 w-11 cursor-pointer place-items-center rounded-[var(--radius-md)] has-[:checked]:shadow-[inset_0_0_0_2px_var(--accent)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]';

/** Name, icon picker and colour swatches; adds a category or changes one. */
export function CategoryForm({
  category,
}: {
  category?: { id: string; name: string; icon: string; colour: string };
}) {
  const [state, onSubmit, pending] = useFormAction<CategoryState>(
    saveCategory.bind(null, category?.id ?? null),
    {},
  );
  const [colour, setColour] = useState(category?.colour ?? 'teal');
  const tone = CATEGORY_COLOURS[colour] ?? CATEGORY_COLOURS.slate!;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="text-label-sm block">
        {t(`${c}.name`)}
        <input
          name="name"
          required
          maxLength={40}
          defaultValue={category?.name ?? ''}
          className={inputClass}
        />
      </label>
      <fieldset>
        <legend className="text-label-sm mb-1">{t(`${c}.icon`)}</legend>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
            <label
              key={key}
              className={pick}
              style={{ background: tone.soft, color: tone.fg }}
              title={t(`${c}.icons.${key}`)}
            >
              <input
                type="radio"
                name="icon"
                value={key}
                defaultChecked={(category?.icon ?? 'receipt') === key}
                aria-label={t(`${c}.icons.${key}`)}
                className="sr-only"
              />
              <Icon size={20} aria-hidden="true" />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-label-sm mb-1">{t(`${c}.colour`)}</legend>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(CATEGORY_COLOURS).map(([key, col]) => (
            <label key={key} className={pick} title={t(`${c}.colours.${key}`)}>
              <input
                type="radio"
                name="colour"
                value={key}
                checked={colour === key}
                onChange={() => setColour(key)}
                aria-label={t(`${c}.colours.${key}`)}
                className="sr-only"
              />
              <span className="h-7 w-7 rounded-full" style={{ background: col.fg }} />
            </label>
          ))}
        </div>
      </fieldset>
      <FormMessage state={state} />
      <button
        type="submit"
        disabled={pending}
        className={category ? `${quietButtonClass} w-fit` : buttonClass}
      >
        {pending ? t('settings.saving') : category ? t(`${c}.save`) : t(`${c}.create`)}
      </button>
    </form>
  );
}

/** A small button that runs a server action and refreshes (archive, add suggested). */
export function ActionLink({
  run,
  label,
  primary,
}: {
  run: 'suggested' | { archive: string; archived: boolean };
  label: string;
  primary?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r =
              run === 'suggested'
                ? await addSuggested()
                : await setCategoryArchived(run.archive, run.archived);
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
        className={
          primary
            ? `${buttonClass} w-fit disabled:opacity-[var(--opacity-disabled)]`
            : 'text-caption min-h-8 rounded-[var(--radius-sm)] px-2 text-[var(--accent-ink)] underline disabled:opacity-[var(--opacity-disabled)]'
        }
      >
        {pending ? t('settings.saving') : label}
      </button>
      {error && (
        <span role="alert" className="text-caption text-[var(--danger)]">
          {error}
        </span>
      )}
    </span>
  );
}
