-- Down migration para archivos clínicos del paciente (0020).
-- Revierte exactamente lo creado en 0020_patient_files.sql: policies de
-- storage.objects, policy y tabla de metadatos y bucket privado.
-- Advertencia: NO borra los objetos ya almacenados en el bucket; respaldar el
-- bucket antes de aplicar este down si se decide eliminar la capacidad.

DROP POLICY IF EXISTS "patient_files_objects_select" ON storage.objects;
DROP POLICY IF EXISTS "patient_files_objects_insert" ON storage.objects;
DROP POLICY IF EXISTS "patient_files_objects_delete" ON storage.objects;
DROP POLICY IF EXISTS "patient_files_admin_all" ON patient_files;
DROP TABLE IF EXISTS patient_files;
DELETE FROM storage.buckets WHERE id = 'patient-files';
