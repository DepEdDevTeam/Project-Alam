DROP POLICY IF EXISTS "Email assets are publicly viewable" ON storage.objects;

CREATE POLICY "Email logo is publicly viewable"
ON storage.objects
FOR SELECT
USING (bucket_id = 'email-assets' AND name = 'deped-logo.png');