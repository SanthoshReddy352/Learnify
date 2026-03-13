-- Create the storage bucket for topic images
INSERT INTO storage.buckets (id, name, public)
VALUES ('topic-images', 'topic-images', true)
ON CONFLICT (id) DO NOTHING;

-- Policy to allow public read access to all images
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'topic-images' );

-- Policy to allow authenticated users to upload images
CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'topic-images' );

-- Policy to allow users to update their own images (or all for now since it's AI generated)
CREATE POLICY "Authenticated Update"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'topic-images' );

-- Policy to allow users to delete images
CREATE POLICY "Authenticated Delete"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'topic-images' );
