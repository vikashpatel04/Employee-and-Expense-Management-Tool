import { redirect } from 'next/navigation';
import { categoryColour, categoryIcon } from '@/lib/expense-style';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { SETTINGS_SECTIONS } from '@/lib/settings-access';
import { createClient } from '@/lib/supabase/server';
import { ActionLink, CategoryForm } from './category-forms';

const card = 'rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--elevation-1)]';

/** Expense categories: icon, colour, archive (no delete: old expenses keep theirs). */
export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const me = (await requireMe())!;
  if (!me.permissions.includes(SETTINGS_SECTIONS.categories)) redirect('/settings');
  const { edit } = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase
    .from('expense_categories')
    .select('id, name, icon, colour, archived')
    .eq('shop_id', me.shopId)
    .order('archived')
    .order('name');
  const categories = data ?? [];
  const editing = categories.find((x) => x.id === edit);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="flex flex-col gap-3">
        <p className="text-body text-[var(--ink-muted)]">{t('settings.categories.subtitle')}</p>
        {categories.length === 0 ? (
          <div className={`${card} flex flex-col gap-3`}>
            <p className="text-body-lg text-[var(--ink-muted)]">{t('settings.categories.empty')}</p>
            <p className="text-body text-[var(--ink-muted)]">
              {t('settings.categories.suggestedHint')}
            </p>
            <ActionLink run="suggested" label={t('settings.categories.suggested')} primary />
          </div>
        ) : (
          <ul className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--elevation-1)]">
            {categories.map((x) => {
              const Icon = categoryIcon(x.icon);
              const col = categoryColour(x.colour);
              return (
                <li
                  key={x.id}
                  className="flex min-h-14 items-center gap-3 border-b border-[var(--line)] px-4 py-2 last:border-0"
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                    style={{ background: col.soft, color: col.fg }}
                  >
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span
                    className={`text-label-sm flex-1 ${x.archived ? 'text-[var(--ink-muted)]' : ''}`}
                  >
                    {x.name}
                    {x.archived && (
                      <span className="text-caption ml-2 rounded-full bg-[var(--surface-muted)] px-2 py-0.5">
                        {t('settings.categories.archived')}
                      </span>
                    )}
                  </span>
                  <a
                    href={`/settings/categories?edit=${x.id}`}
                    className="text-caption min-h-8 px-2 text-[var(--accent-ink)] underline"
                  >
                    {t('expenses.edit')}
                  </a>
                  <ActionLink
                    run={{ archive: x.id, archived: !x.archived }}
                    label={
                      x.archived
                        ? t('settings.categories.unarchive')
                        : t('settings.categories.archive')
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className={card}>
        <h2 className="text-title-md mb-4">
          {editing ? editing.name : t('settings.categories.add')}
        </h2>
        <CategoryForm key={editing?.id ?? 'new'} category={editing} />
      </section>
    </div>
  );
}
