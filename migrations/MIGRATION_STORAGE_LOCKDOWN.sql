-- ============================================================
-- Migration: kunci Storage "item-photos" — cabut hak DELETE/UPDATE anon
--   Sebelumnya anon boleh hapus/timpa SEMUA foto barang (policy hanya cek
--   bucket_id, tanpa batas pemilik) → siapa pun bisa hapus foto orang lain.
--   Upload (INSERT) + lihat (SELECT) tetap dibuka supaya app jalan normal.
--   Jalankan sekali di Supabase → SQL Editor. Idempotent (aman diulang).
-- ============================================================

-- Cabut hak hapus & ganti dari anon (biarkan INSERT + SELECT dari
-- MIGRATION_STORAGE_BUCKET.sql tetap ada)
DROP POLICY IF EXISTS "item_photos_update" ON storage.objects;
DROP POLICY IF EXISTS "item_photos_delete" ON storage.objects;

-- Jika nanti admin perlu hapus/ganti foto lama, lakukan lewat Edge Function
-- dengan service_role (yang melewati RLS), bukan dengan anon key dari browser.

-- Cek hasil (harusnya tinggal item_photos_insert + item_photos_select):
-- SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'objects' AND policyname LIKE 'item_photos%';
