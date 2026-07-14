-- ============================================================
-- product_refs — 供應商 / 產品「知識庫」，跟實際倉庫庫存完全分開。
--   單純記錄「這個東西不錯、以後可能會買」，不綁 qty / 倉庫，
--   之後靠關鍵字搜尋找回來。跟 items(真的在管理的庫存)是兩回事，
--   故意不共用同一張表，才不會污染低庫存警示 / CSV 匯出 / 庫存統計。
--
-- ⚠️ 一定要在「gudang 專案」執行：網址必須是
--    https://supabase.com/dashboard/project/klswfuzuhlowzrbncreu/sql/...
-- ============================================================

CREATE TABLE IF NOT EXISTS public.product_refs (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL,
  supplier_name text,
  url           text,
  image_url     text,
  note          text,           -- harga/spek/kenapa bagus — bebas teks
  created_by    text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 比照 categories/items 現況：全開政策（前端用 anon key 直接讀寫）
ALTER TABLE public.product_refs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_product_refs_select ON public.product_refs;
DROP POLICY IF EXISTS allow_all_product_refs_insert ON public.product_refs;
DROP POLICY IF EXISTS allow_all_product_refs_update ON public.product_refs;
DROP POLICY IF EXISTS allow_all_product_refs_delete ON public.product_refs;

CREATE POLICY allow_all_product_refs_select ON public.product_refs FOR SELECT USING (true);
CREATE POLICY allow_all_product_refs_insert ON public.product_refs FOR INSERT WITH CHECK (true);
CREATE POLICY allow_all_product_refs_update ON public.product_refs FOR UPDATE USING (true);
CREATE POLICY allow_all_product_refs_delete ON public.product_refs FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_refs TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.product_refs_id_seq TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_product_refs_name ON public.product_refs (lower(name));

-- ── 驗證：應回傳 0 rows（空表，正常）──
--   select * from public.product_refs;

-- ── 如需回復（rollback）──
--   DROP TABLE public.product_refs;
