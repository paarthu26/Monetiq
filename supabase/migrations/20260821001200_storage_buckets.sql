-- ---------------------------------------------------------------------------
-- 0012  Storage: three PRIVATE, TRANSIENT staging buckets.
--
-- These are not document stores. A file lives here only between upload and
-- extraction — seconds to minutes — and the Edge Function that processes it
-- deletes it as part of its own execution. There is no permanent document
-- bucket in this product and no "view original document" capability anywhere.
--
-- Object key convention (enforced by the policies below):
--     <auth.uid()>/<filename>
--
-- Deliberately NO super_admin blanket-read policy. Admins have no business
-- browsing other users' staged receipts, and granting it would contradict the
-- product's own privacy principle.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('receipts-staging', 'receipts-staging', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']),
  ('bank-statements-staging', 'bank-statements-staging', false, 20971520,
   array['application/pdf', 'text/csv', 'application/vnd.ms-excel']),
  ('loan-documents-staging', 'loan-documents-staging', false, 20971520,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects already has RLS enabled by Supabase.

drop policy if exists monetiq_staging_select_own on storage.objects;
create policy monetiq_staging_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id in ('receipts-staging', 'bank-statements-staging', 'loan-documents-staging')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists monetiq_staging_insert_own on storage.objects;
create policy monetiq_staging_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('receipts-staging', 'bank-statements-staging', 'loan-documents-staging')
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_account_active()
  );

drop policy if exists monetiq_staging_update_own on storage.objects;
create policy monetiq_staging_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id in ('receipts-staging', 'bank-statements-staging', 'loan-documents-staging')
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_account_active()
  )
  with check (
    bucket_id in ('receipts-staging', 'bank-statements-staging', 'loan-documents-staging')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists monetiq_staging_delete_own on storage.objects;
create policy monetiq_staging_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('receipts-staging', 'bank-statements-staging', 'loan-documents-staging')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

comment on policy monetiq_staging_select_own on storage.objects is
  'Staging buckets are per-user: a caller can only reach objects under their own <uid>/ prefix. No admin blanket-read policy exists by design.';
