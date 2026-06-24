
-- Create private documents bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Admins can do anything with files in the documents bucket
CREATE POLICY "Admins manage documents bucket"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'documents' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'documents' AND public.has_role(auth.uid(), 'admin'));

-- Authenticated users can read documents (signed URLs gate actual access)
CREATE POLICY "Authenticated read documents bucket"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'documents');
