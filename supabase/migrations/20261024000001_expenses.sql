-- Phase 6: expenses (docs/PLAN.md §4.8), expense categories, bill photos.
--
--   * Paid by: owner, shop cash or a staff member. Charged to: the shop, a staff member, or
--     Not tracked (kept for the record, out of every total).
--   * Charged to staff posts a `staff_charge` line (negative) on their ledger; paid by staff with
--     `reimburse` posts a `reimbursement` line (positive). A trigger posts them, like advances.
--   * The ledger stays append-only: changing an expense's money reverses the lines it posted and
--     posts new ones; deleting it reverses them.
--   * Bill photos live in the private Storage bucket `bills`, at `<shop_id>/<expense_id>.<ext>`.
--     Whoever can see the expense can see its bill.

-- ---------------------------------------------------------------------------
-- Categories (user-defined, with an icon and a colour key the apps map to tokens)
-- ---------------------------------------------------------------------------
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  icon text not null default 'receipt' check (icon ~ '^[a-z][a-z0-9-]{0,31}$'),
  colour text not null default 'slate' check (colour ~ '^[a-z][a-z0-9-]{0,31}$'),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (shop_id, name),
  unique (shop_id, id)
);

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  date date not null,
  amount_paise bigint not null check (amount_paise > 0),
  category_id uuid not null,
  payment_mode text not null default 'cash' check (payment_mode in ('cash', 'upi', 'bank', 'card')),
  note text,
  bill_path text,
  paid_by_kind text not null default 'owner' check (paid_by_kind in ('owner', 'shop_cash', 'staff')),
  paid_by_staff_id uuid,
  charged_to_kind text not null default 'shop' check (charged_to_kind in ('shop', 'staff', 'not_tracked')),
  charged_to_staff_id uuid,
  reimburse boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (shop_id, category_id) references public.expense_categories (shop_id, id),
  foreign key (shop_id, paid_by_staff_id) references public.staff (shop_id, person_id),
  foreign key (shop_id, charged_to_staff_id) references public.staff (shop_id, person_id),
  foreign key (shop_id, created_by) references public.people (shop_id, id) on delete set null (created_by),
  check ((paid_by_kind = 'staff') = (paid_by_staff_id is not null)),
  check ((charged_to_kind = 'staff') = (charged_to_staff_id is not null)),
  check (not reimburse or paid_by_kind = 'staff'),
  check (bill_path is null or bill_path like shop_id::text || '/%')
);
create index expenses_shop_date_idx on public.expenses (shop_id, date);
create index expenses_shop_category_idx on public.expenses (shop_id, category_id);
create index expenses_shop_paid_by_idx on public.expenses (shop_id, paid_by_staff_id);
create index expenses_shop_charged_to_idx on public.expenses (shop_id, charged_to_staff_id);
create index expenses_shop_created_by_idx on public.expenses (shop_id, created_by);

-- Who added it (the signed-in person's record in that shop) and when it last changed.
create function private.stamp_expense()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := private.person_id(new.shop_id);
    end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger expenses_stamp before insert or update on public.expenses
  for each row execute function private.stamp_expense();

-- Post (and on change, reverse and re-post) the staff ledger lines an expense creates.
-- Mirrors packages/core expenseLedgerLines.
create function private.post_expense()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  line public.ledger_entries;
begin
  if tg_op = 'UPDATE'
     and (old.date, old.amount_paise, old.paid_by_kind, old.paid_by_staff_id, old.charged_to_kind,
          old.charged_to_staff_id, old.reimburse)
         is not distinct from
         (new.date, new.amount_paise, new.paid_by_kind, new.paid_by_staff_id, new.charged_to_kind,
          new.charged_to_staff_id, new.reimburse) then
    return new; -- a note, category, mode or bill change moves no money
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    for line in
      select l.* from public.ledger_entries l
      where l.ref_table = 'expenses' and l.ref_id = old.id and l.type <> 'reversal'
        and not exists (select 1 from public.ledger_entries r where r.reverses_id = l.id)
    loop
      insert into public.ledger_entries
        (shop_id, staff_id, date, type, amount_paise, reverses_id, ref_table, ref_id, note)
      values (line.shop_id, line.staff_id, private.today_ist(), 'reversal', -line.amount_paise,
              line.id, 'expenses', old.id, line.note);
    end loop;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    if new.charged_to_kind = 'staff' then
      insert into public.ledger_entries
        (shop_id, staff_id, date, type, amount_paise, payment_mode, ref_table, ref_id, note)
      values (new.shop_id, new.charged_to_staff_id, new.date, 'staff_charge', -new.amount_paise,
              new.payment_mode, 'expenses', new.id, new.note);
    end if;
    if new.paid_by_kind = 'staff' and new.reimburse then
      insert into public.ledger_entries
        (shop_id, staff_id, date, type, amount_paise, payment_mode, ref_table, ref_id, note)
      values (new.shop_id, new.paid_by_staff_id, new.date, 'reimbursement', new.amount_paise,
              new.payment_mode, 'expenses', new.id, new.note);
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger expenses_post after insert or update or delete on public.expenses
  for each row execute function private.post_expense();

create trigger expense_categories_audit after insert or update or delete on public.expense_categories
  for each row execute function private.write_audit();
create trigger expenses_audit after insert or update or delete on public.expenses
  for each row execute function private.write_audit();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

-- Categories: everyone in the shop reads; expenses.categories writes. No delete (archive).
create policy expense_categories_read on public.expense_categories for select to authenticated
  using (private.is_member(shop_id));
create policy expense_categories_insert on public.expense_categories for insert to authenticated
  with check (private.has_permission(shop_id, 'expenses.categories'));
create policy expense_categories_update on public.expense_categories for update to authenticated
  using (private.has_permission(shop_id, 'expenses.categories'))
  with check (private.has_permission(shop_id, 'expenses.categories'));

-- Expenses: view_all sees every one; otherwise the ones you added, and the ones that touch
-- your own ledger (paid by you, charged to you). expenses.add adds; expenses.edit edits/deletes.
create policy expenses_read on public.expenses for select to authenticated
  using (
    private.has_permission(shop_id, 'expenses.view_all')
    or created_by = private.person_id(shop_id)
    or private.is_self(paid_by_staff_id)
    or private.is_self(charged_to_staff_id)
  );
create policy expenses_insert on public.expenses for insert to authenticated
  with check (private.has_permission(shop_id, 'expenses.add'));
create policy expenses_update on public.expenses for update to authenticated
  using (private.has_permission(shop_id, 'expenses.edit'))
  with check (private.has_permission(shop_id, 'expenses.edit'));
create policy expenses_delete on public.expenses for delete to authenticated
  using (private.has_permission(shop_id, 'expenses.edit'));

-- Expense lines come only from this trigger (the ledger insert policy denies them directly).
-- The trigger also writes reversals of expense lines, so salary.undo_payment isn't needed.

revoke all on public.expense_categories, public.expenses from anon;

-- ---------------------------------------------------------------------------
-- Bill photos: private bucket `bills`, objects at `<shop_id>/<file>`
-- ---------------------------------------------------------------------------
create function private.uuid_or_null(p text)
returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  return p::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bills', 'bills', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Read a bill you uploaded (Storage stamps owner_id; uploads read their row back), or one an
-- expense you can see points at (expenses RLS decides).
create policy bills_read on storage.objects for select to authenticated
  using (
    bucket_id = 'bills'
    and (
      owner_id = auth.uid()::text
      or exists (select 1 from public.expenses e where e.bill_path = storage.objects.name)
    )
  );
-- Upload into your shop's folder with expenses.add (the expense row is written after).
create policy bills_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bills'
    and private.has_permission(private.uuid_or_null((storage.foldername(name))[1]), 'expenses.add')
  );
-- Remove with expenses.edit (replacing or deleting a bill).
create policy bills_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'bills'
    and private.has_permission(private.uuid_or_null((storage.foldername(name))[1]), 'expenses.edit')
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function private.stamp_expense(), private.post_expense() from public, anon, authenticated;
revoke all on function private.uuid_or_null(text) from public, anon;
grant execute on function private.uuid_or_null(text) to authenticated, service_role;
