# Staff documents

Built 2026-10-26 (PLAN §5 `staff_documents`, §6.1 staff detail "Documents"). Design: "Web · staff
documents" on the FinCrew canvas (v33).

## What it does

- Each staff member has documents: a **photo or a PDF** with a **name**. Names are free text;
  the apps suggest common ones (Aadhaar card, PAN card, Bank passbook, Photo, Address proof,
  Joining letter — `staffDocs.suggestions` in i18n), nothing is a fixed list.
- **Who:** read by the person themself or anyone with `staff.view`; add, rename, delete with
  `staff.edit` (roles decide, as everywhere).
- **Files:** private Storage bucket `staff-docs`, `<shop>/<staff>/<document id>.<ext>`, up to
  4 MB (the website uploads through a Vercel function, 4.5 MB request limit). Photos are shrunk
  before upload to about 600 KB (ID cards stay readable); PDFs go as they are.
- Opening uses short-lived signed links (10 minutes); the page makes new ones each visit.
- Deleting removes the row and the file (documents aren't money records, so not append-only).
  Every change is in the audit log.

## Code

- Migration `20261026000002_staff_documents.sql`: table (composite FK to the shop's staff,
  `uploaded_by` stamped by trigger, mime and name checks), RLS, audit trigger, bucket and its
  Storage policies (read: uploader or a document row you can see; insert / delete: staff.edit in
  the folder's shop).
- Tests `supabase/tests/staff-documents.test.ts` (10): owner / role with staff.edit / staff.view
  only / the staff member / another shop, FK across shops, file types, Storage rules.
- `packages/data/src/staff-documents.ts`: `loadStaffDocuments` (with signed links),
  `addStaffDocument` (file first, then the row; file removed if the row is refused),
  `deleteStaffDocument`, `fileSize`, `MAX_DOC_BYTES`.
- Website: staff page tab **Documents** (`staff/[id]/documents-tab.tsx`, `documents-forms.tsx`,
  `documents-actions.ts`): card grid with photo previews, Open / Delete (two taps), "Add
  document" dialog (name + suggestion chips, file; photos shrunk with `compressImage`).
  `next.config.ts` raises the server action body limit to 5 MB.
- App: staff detail tab **Docs** (`components/staff/documents.tsx`): list with previews, tap to
  open, Add (Camera / Photo / PDF via `expo-document-picker`, name chips), delete with a sheet.
  `lib/bill-photo.ts` `pickPhoto(source, target)` shrinks to a chosen size.

## Checked

Typecheck 9/9, tests (10 new), website build, migration dry-run on live (rolled back). Not yet
tried on live: needs the push (table and bucket), then an upload on Test Staff.
