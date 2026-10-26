-- Staff documents (PLAN §5 staff_documents, §6.1 staff detail "Documents"): ID proofs, bank
-- details, contracts — a photo or a PDF per document, named freely (the apps suggest common
-- names; nothing is a fixed list). Files live in the private Storage bucket `staff-docs` at
-- `<shop_id>/<staff_id>/<document_id>.<ext>`. Docs: docs/features/staff-documents.md.

create table public.staff_documents (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  staff_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 80),
  file_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes > 0),
  uploaded_by uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (shop_id, staff_id) references public.staff (shop_id, person_id) on delete cascade
);
create index staff_documents_staff_idx on public.staff_documents (staff_id, created_at desc);

-- Who added it: the signed-in person in that shop (not taken from the request).
create function private.stamp_staff_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.uploaded_by := private.person_id(new.shop_id);
  return new;
end;
$$;
create trigger staff_documents_stamp before insert on public.staff_documents
  for each row execute function private.stamp_staff_document();
create trigger staff_documents_audit after insert or update or delete on public.staff_documents
  for each row execute function private.write_audit();

alter table public.staff_documents enable row level security;

-- Read: the person themself, or staff.view. Add / rename / remove: staff.edit.
create policy staff_documents_read on public.staff_documents for select to authenticated
  using (private.is_self(staff_id) or private.has_permission(shop_id, 'staff.view'));
create policy staff_documents_insert on public.staff_documents for insert to authenticated
  with check (private.has_permission(shop_id, 'staff.edit'));
create policy staff_documents_update on public.staff_documents for update to authenticated
  using (private.has_permission(shop_id, 'staff.edit'))
  with check (private.has_permission(shop_id, 'staff.edit'));
create policy staff_documents_delete on public.staff_documents for delete to authenticated
  using (private.has_permission(shop_id, 'staff.edit'));

grant select, insert, update, delete on public.staff_documents to authenticated;
revoke all on public.staff_documents from anon;

-- ---------------------------------------------------------------------------
-- Files: private bucket `staff-docs`, objects at `<shop_id>/<staff_id>/<file>`.
-- 4 MB: the website uploads through a Vercel function (4.5 MB request limit); photos are shrunk
-- first, so only big PDFs come near it.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-docs', 'staff-docs', false, 4194304,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- Read a file you uploaded, or one a document row you can see points at (its RLS decides).
create policy staff_docs_read on storage.objects for select to authenticated
  using (
    bucket_id = 'staff-docs'
    and (
      owner_id = auth.uid()::text
      or exists (select 1 from public.staff_documents d where d.file_path = storage.objects.name)
    )
  );
create policy staff_docs_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'staff-docs'
    and private.has_permission(private.uuid_or_null((storage.foldername(name))[1]), 'staff.edit')
  );
create policy staff_docs_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'staff-docs'
    and private.has_permission(private.uuid_or_null((storage.foldername(name))[1]), 'staff.edit')
  );

revoke all on function private.stamp_staff_document() from public, anon, authenticated;
