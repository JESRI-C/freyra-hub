
CREATE POLICY "monitoring_uploads_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'monitoring-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "monitoring_uploads_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'monitoring-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "monitoring_uploads_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'monitoring-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "monitoring_uploads_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'monitoring-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
