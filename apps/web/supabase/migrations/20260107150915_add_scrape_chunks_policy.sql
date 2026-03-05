-- Allow authenticated admins/staff to insert into scrape_job_chunks
CREATE POLICY "Admin can create scrape job chunks"
ON scrape_job_chunks
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = ANY (ARRAY['admin', 'staff'])
  )
);
