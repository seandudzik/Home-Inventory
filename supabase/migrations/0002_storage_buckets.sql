-- ============================================================
-- Storage buckets
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'item-images',
    'item-images',
    false,
    20971520, -- 20 MiB in bytes
    array['image/jpeg', 'image/png', 'image/heic', 'image/webp']
  ),
  (
    'item-documents',
    'item-documents',
    false,
    52428800, -- 50 MiB in bytes
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  )
on conflict (id) do nothing;


-- ============================================================
-- Storage RLS policies
-- Storage uses storage.objects — we gate access by checking
-- that the path prefix matches an item the user has access to.
--
-- Path convention:
--   item-images:   {household_id}/{item_id}/{filename}
--   item-documents: {household_id}/{item_id}/{filename}
-- ============================================================

-- item-images
create policy "household members can upload item images"
  on storage.objects for insert
  with check (
    bucket_id = 'item-images'
    and is_household_member((string_to_array(name, '/'))[1]::uuid)
  );

create policy "household members can read item images"
  on storage.objects for select
  using (
    bucket_id = 'item-images'
    and is_household_member((string_to_array(name, '/'))[1]::uuid)
  );

create policy "household members can delete item images"
  on storage.objects for delete
  using (
    bucket_id = 'item-images'
    and is_household_member((string_to_array(name, '/'))[1]::uuid)
  );

-- item-documents
create policy "household members can upload item documents"
  on storage.objects for insert
  with check (
    bucket_id = 'item-documents'
    and is_household_member((string_to_array(name, '/'))[1]::uuid)
  );

create policy "household members can read item documents"
  on storage.objects for select
  using (
    bucket_id = 'item-documents'
    and is_household_member((string_to_array(name, '/'))[1]::uuid)
  );

create policy "household members can delete item documents"
  on storage.objects for delete
  using (
    bucket_id = 'item-documents'
    and is_household_member((string_to_array(name, '/'))[1]::uuid)
  );
