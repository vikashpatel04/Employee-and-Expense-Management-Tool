'use server';

import { revalidatePath } from 'next/cache';
import { CATEGORY_COLOURS, CATEGORY_ICONS, SUGGESTED_CATEGORIES } from '@/lib/expense-style';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { SETTINGS_SECTIONS } from '@/lib/settings-access';
import { createClient } from '@/lib/supabase/server';

export type CategoryState = { error?: string; done?: string };

async function allowed() {
  const me = await requireMe();
  return me && me.permissions.includes(SETTINGS_SECTIONS.categories) ? me : null;
}

function read(form: FormData) {
  const name = String(form.get('name') ?? '').trim();
  const icon = String(form.get('icon') ?? '');
  const colour = String(form.get('colour') ?? '');
  return {
    name,
    icon: icon in CATEGORY_ICONS ? icon : 'receipt',
    colour: colour in CATEGORY_COLOURS ? colour : 'slate',
  };
}

const failed = (error: { code?: string; message: string }) =>
  error.code === '23505'
    ? { error: t('settings.categories.errors.nameTaken') }
    : { error: t('settings.errors.failed', { reason: error.message }) };

function refresh() {
  revalidatePath('/settings/categories');
  revalidatePath('/expenses');
}

/** Add (`id` null) or change a category's name, icon and colour. */
export async function saveCategory(
  id: string | null,
  _prev: CategoryState,
  form: FormData,
): Promise<CategoryState> {
  const me = await allowed();
  if (!me) return { error: t('settings.errors.noPermission') };
  const row = read(form);
  if (!row.name) return { error: t('settings.categories.errors.name') };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from('expense_categories').update(row).eq('id', id).eq('shop_id', me.shopId)
    : await supabase.from('expense_categories').insert({ ...row, shop_id: me.shopId });
  if (error) return failed(error);
  refresh();
  return { done: t('settings.categories.saved') };
}

export async function setCategoryArchived(id: string, archived: boolean): Promise<CategoryState> {
  const me = await allowed();
  if (!me) return { error: t('settings.errors.noPermission') };
  const supabase = await createClient();
  const { error } = await supabase
    .from('expense_categories')
    .update({ archived })
    .eq('id', id)
    .eq('shop_id', me.shopId);
  if (error) return failed(error);
  refresh();
  return {};
}

/** "Add the usual ones": the suggested set, skipping names the shop already has. */
export async function addSuggested(): Promise<CategoryState> {
  const me = await allowed();
  if (!me) return { error: t('settings.errors.noPermission') };
  const supabase = await createClient();
  const { data: have } = await supabase
    .from('expense_categories')
    .select('name')
    .eq('shop_id', me.shopId);
  const taken = new Set((have ?? []).map((c) => c.name.toLowerCase()));
  const rows = SUGGESTED_CATEGORIES.map((s) => ({
    shop_id: me.shopId,
    name: t(`settings.categories.suggestedNames.${s.key}`),
    icon: s.icon,
    colour: s.colour,
  })).filter((r) => !taken.has(r.name.toLowerCase()));
  if (rows.length) {
    const { error } = await supabase.from('expense_categories').insert(rows);
    if (error) return failed(error);
  }
  refresh();
  return {};
}
