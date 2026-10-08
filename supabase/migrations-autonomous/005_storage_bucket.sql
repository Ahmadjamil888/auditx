-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005: Supabase Storage bucket for documents
-- ─────────────────────────────────────────────────────────────────────────────

-- Create a private bucket (public = false means files are not publicly accessible)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  52428800,  -- 50 MB per file
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'text/plain',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit   = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS: org members can upload to their own org folder
DROP POLICY IF EXISTS "org_members_upload" ON storage.objects;
CREATE POLICY "org_members_upload"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (storage.foldername(name))[1] = p.org_id::TEXT
    )
  );

-- RLS: org members can read their own files
DROP POLICY IF EXISTS "org_members_read" ON storage.objects;
CREATE POLICY "org_members_read"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (storage.foldername(name))[1] = p.org_id::TEXT
    )
  );

-- RLS: org owners/admins can delete files
DROP POLICY IF EXISTS "org_admins_delete" ON storage.objects;
CREATE POLICY "org_admins_delete"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (storage.foldername(name))[1] = p.org_id::TEXT
        AND p.role IN ('owner', 'admin')
    )
  );
