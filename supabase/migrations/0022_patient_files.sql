-- Archivos clínicos del paciente (issue #91).
-- Idempotente: tabla, índices, policies y bucket con guardas.

-- 1) Metadatos.
CREATE TABLE IF NOT EXISTS patient_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinical_visit_id uuid REFERENCES clinical_visits(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'document'
    CHECK (category IN ('radiograph', 'clinical_photo', 'document', 'consent', 'other')),
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_files_patient_created
  ON patient_files (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_files_visit
  ON patient_files (clinical_visit_id);

-- 2) RLS de metadatos (estilo 0017/0018): solo staff autenticado, anon denegado.
ALTER TABLE patient_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_files FORCE ROW LEVEL SECURITY;

REVOKE ALL ON patient_files FROM anon;
REVOKE ALL ON patient_files FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON patient_files TO authenticated;

DROP POLICY IF EXISTS "patient_files_admin_all" ON patient_files;
CREATE POLICY "patient_files_admin_all" ON patient_files
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- 3) Bucket privado (segunda barrera de tipo/tamaño).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-files',
  'patient-files',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 4) Policies de storage: solo authenticated, nunca anon.
DROP POLICY IF EXISTS "patient_files_objects_select" ON storage.objects;
CREATE POLICY "patient_files_objects_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'patient-files');

DROP POLICY IF EXISTS "patient_files_objects_insert" ON storage.objects;
CREATE POLICY "patient_files_objects_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'patient-files');

DROP POLICY IF EXISTS "patient_files_objects_delete" ON storage.objects;
CREATE POLICY "patient_files_objects_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'patient-files');
