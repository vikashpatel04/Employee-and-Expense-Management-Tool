import { redirect } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import { FormDialog } from '@/components/app/form-dialog';
import { categoryColour, categoryIcon } from '@/lib/expense-style';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { SETTINGS_SECTIONS } from '@/lib/settings-access';
import { createClient } from '@/lib/supabase/server';
import { ActionLink, CategoryForm } from './category-forms';

const card = 'rounded-lg border bg-card p-4 shadow-xs';

/** Expense categories: icon, colour, archive (no delete: old expenses keep theirs). */
export default async function CategoriesPage() {
  const me = (await requireMe())!;
  if (!me.permissions.includes(SETTINGS_SECTIONS.categories)) redirect('/settings');

  const supabase = await createClient();
  const { data } = await supabase
    .from('expense_categories')
    .select('id, name, icon, colour, archived')
    .eq('shop_id', me.shopId)
    .order('archived')
    .order('name');
  const categories = data ?? [];

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">{t('settings.categories.subtitle')}</p>
          <FormDialog
            title={t('settings.categories.add')}
            variant="default"
            trigger={
              <>
                <Plus aria-hidden="true" />
                {t('settings.categories.add')}
              </>
            }
          >
            <CategoryForm />
          </FormDialog>
        </div>
        {categories.every((x) => x.archived) && (
          <div className={`${card} flex flex-col gap-3`}>
            <p className="text-body-lg text-[var(--ink-muted)]">{t('settings.categories.empty')}</p>
            <p className="text-body text-[var(--ink-muted)]">
              {t('settings.categories.suggestedHint')}
            </p>
            <ActionLink run="suggested" label={t('settings.categories.suggested')} primary />
          </div>
        )}
        {categories.length > 0 && (
          <ul className="bg-card overflow-hidden rounded-lg border shadow-xs">
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
                  <FormDialog
                    title={x.name}
                    variant="ghost"
                    size="sm"
                    trigger={
                      <>
                        <Pencil aria-hidden="true" />
                        {t('expenses.edit')}
                      </>
                    }
                  >
                    <CategoryForm category={x} />
                  </FormDialog>
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
    </div>
  );
}
