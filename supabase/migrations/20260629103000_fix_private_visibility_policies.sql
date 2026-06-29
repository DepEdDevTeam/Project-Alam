DROP POLICY IF EXISTS "Authenticated users read collections" ON public.collections;
DROP POLICY IF EXISTS "Public collections readable" ON public.collections;
CREATE POLICY "Public collections readable"
ON public.collections
FOR SELECT
TO authenticated, anon
USING (is_public = true OR private.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Dataset rows follow collection visibility" ON public.dataset_rows;
CREATE POLICY "Dataset rows follow collection visibility"
ON public.dataset_rows
FOR SELECT
TO authenticated, anon
USING (
  EXISTS (
    SELECT 1
    FROM public.collections c
    WHERE c.id = dataset_rows.collection_id
      AND (c.is_public = true OR private.is_admin_or_super_admin(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Authenticated users read documents" ON public.documents;
DROP POLICY IF EXISTS "Public documents readable" ON public.documents;
CREATE POLICY "Public documents readable"
ON public.documents
FOR SELECT
TO authenticated, anon
USING (is_public = true OR private.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Document chunks follow document visibility" ON public.document_chunks;
CREATE POLICY "Document chunks follow document visibility"
ON public.document_chunks
FOR SELECT
TO authenticated, anon
USING (
  EXISTS (
    SELECT 1
    FROM public.documents d
    WHERE d.id = document_chunks.document_id
      AND (d.is_public = true OR private.is_admin_or_super_admin(auth.uid()))
  )
);
