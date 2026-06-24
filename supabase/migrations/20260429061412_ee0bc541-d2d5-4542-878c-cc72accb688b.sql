INSERT INTO storage.buckets (id, name, public)
VALUES ('email-assets', 'email-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Email assets are publicly viewable"
ON storage.objects
FOR SELECT
USING (bucket_id = 'email-assets');

CREATE POLICY "Authenticated users can upload email assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'email-assets');

CREATE POLICY "Authenticated users can update email assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'email-assets')
WITH CHECK (bucket_id = 'email-assets');

CREATE POLICY "Authenticated users can delete email assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'email-assets');