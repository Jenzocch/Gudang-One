-- ============================================================
-- Migration: Supabase Storage bucket "item-photos"
--   Untuk fitur upload foto (foto barang / lokasi simpan / permintaan)
--   Tanpa bucket ini, app otomatis fallback ke base64 (boros DB).
--   Jalankan sekali di Supabase → SQL Editor.
-- ============================================================

-- 1) Buat bucket publik "item-photos" (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('item-photos', 'item-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2) Policy: siapa pun (anon) boleh UPLOAD foto ke bucket ini
DROP POLICY IF EXISTS "item_photos_insert" ON storage.objects;
CREATE POLICY "item_photos_insert"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'item-photos');

-- 3) Policy: siapa pun boleh MELIHAT foto (bucket publik)
DROP POLICY IF EXISTS "item_photos_select" ON storage.objects;
CREATE POLICY "item_photos_select"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'item-photos');

-- 4) (Opsional) izinkan hapus/ganti foto lama
DROP POLICY IF EXISTS "item_photos_update" ON storage.objects;
CREATE POLICY "item_photos_update"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'item-photos');

DROP POLICY IF EXISTS "item_photos_delete" ON storage.objects;
CREATE POLICY "item_photos_delete"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'item-photos');

-- Cek hasil:
-- SELECT id, name, public FROM storage.buckets WHERE id = 'item-photos';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'objects';
