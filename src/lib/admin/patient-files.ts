import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { PatientFile, PatientFileCategory } from './types';
import { NotFoundError } from './errors';
import { ValidationError, parseStatus, parseUuid } from './validate';

export const PATIENT_FILES_BUCKET = 'patient-files';
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export const PATIENT_FILE_CATEGORIES: readonly PatientFileCategory[] = [
  'radiograph',
  'clinical_photo',
  'document',
  'consent',
  'other',
];
export const SIGNED_URL_EXPIRES_SECONDS = 60 * 5; // 5 min

const SELECT_COLUMNS = [
  'id',
  'patient_id',
  'clinical_visit_id',
  'category',
  'storage_path',
  'file_name',
  'mime_type',
  'size_bytes',
  'uploaded_by',
  'created_at',
].join(', ');

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export type FileValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export type UploadPatientFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export type UploadPatientFileInput = {
  file: UploadPatientFile;
  category?: string | null;
  clinicalVisitId?: string | null;
  uploadedBy?: string | null;
};

/** Valida tipo MIME y tamaño. El mensaje es el que ve el usuario. */
export function validatePatientFileUpload(file: {
  type: string;
  size: number;
}): FileValidationResult {
  if (
    !ALLOWED_MIME_TYPES.includes(
      file.type as (typeof ALLOWED_MIME_TYPES)[number]
    )
  ) {
    return {
      ok: false,
      message: 'Solo se permiten archivos JPG, PNG, WEBP o PDF.',
    };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      message: 'El archivo no debe superar 10 MB.',
    };
  }
  return { ok: true };
}

function extensionFor(mimeType: string): string {
  return MIME_EXTENSIONS[mimeType] ?? 'bin';
}

function mapRow(row: Record<string, unknown>): PatientFile {
  return {
    id: row.id as string,
    patientId: row.patient_id as string,
    clinicalVisitId: (row.clinical_visit_id as string | null) ?? null,
    category: row.category as PatientFileCategory,
    storagePath: row.storage_path as string,
    fileName: row.file_name as string,
    mimeType: row.mime_type as string,
    sizeBytes: Number(row.size_bytes),
    uploadedBy: (row.uploaded_by as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function listPatientFiles(
  patientId: string,
  options?: { clinicalVisitId?: string | null }
): Promise<PatientFile[]> {
  const parsedPatientId = parseUuid(patientId, 'patientId');
  const parsedVisitId =
    options?.clinicalVisitId === null || options?.clinicalVisitId === undefined
      ? null
      : parseUuid(options.clinicalVisitId, 'clinicalVisitId');
  const supabase = getSupabaseAdmin();

  const baseQuery = supabase
    .from('patient_files')
    .select(SELECT_COLUMNS)
    .eq('patient_id', parsedPatientId);
  const filteredQuery =
    parsedVisitId === null
      ? baseQuery
      : baseQuery.eq('clinical_visit_id', parsedVisitId);

  const { data, error } = await filteredQuery.order('created_at', {
    ascending: false,
  });
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapRow);
}

export async function listPatientFilesWithUrls(
  patientId: string,
  options?: { clinicalVisitId?: string | null }
): Promise<PatientFile[]> {
  const files = await listPatientFiles(patientId, options);
  if (files.length === 0) {
    return files;
  }

  const { data, error } = await getSupabaseAdmin()
    .storage.from(PATIENT_FILES_BUCKET)
    .createSignedUrls(
      files.map((file) => file.storagePath),
      SIGNED_URL_EXPIRES_SECONDS
    );
  if (error) {
    throw new Error(error.message);
  }

  const urlByPath = new Map<string, string>();
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) {
      urlByPath.set(entry.path, entry.signedUrl);
    }
  }
  return files.map((file) => ({
    ...file,
    signedUrl: urlByPath.get(file.storagePath),
  }));
}

export async function uploadPatientFile(
  patientId: string,
  input: UploadPatientFileInput
): Promise<PatientFile> {
  const validation = validatePatientFileUpload(input.file);
  if (!validation.ok) {
    throw new ValidationError('file', validation.message);
  }

  const parsedPatientId = parseUuid(patientId, 'patientId');
  const category =
    parseStatus(
      input.category ?? 'document',
      PATIENT_FILE_CATEGORIES,
      'category'
    ) ?? 'document';

  const supabase = getSupabaseAdmin();
  let clinicalVisitId: string | null = null;
  if (
    input.clinicalVisitId !== null &&
    input.clinicalVisitId !== undefined
  ) {
    const parsedVisitId = parseUuid(input.clinicalVisitId, 'clinicalVisitId');
    const { data: visit, error: visitError } = await supabase
      .from('clinical_visits')
      .select('id')
      .eq('id', parsedVisitId)
      .eq('patient_id', parsedPatientId)
      .maybeSingle();
    if (visitError || !visit) {
      throw new NotFoundError('Clinical visit');
    }
    clinicalVisitId = parsedVisitId;
  }

  const objectId = crypto.randomUUID();
  const storagePath = `${parsedPatientId}/${objectId}.${extensionFor(
    input.file.type
  )}`;
  const bytes = await input.file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(PATIENT_FILES_BUCKET)
    .upload(storagePath, bytes, {
      contentType: input.file.type,
      upsert: false,
    });
  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data, error: insertError } = await supabase
    .from('patient_files')
    .insert({
      patient_id: parsedPatientId,
      clinical_visit_id: clinicalVisitId,
      category,
      storage_path: storagePath,
      file_name: input.file.name,
      mime_type: input.file.type,
      size_bytes: input.file.size,
      uploaded_by: input.uploadedBy ?? null,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (insertError || !data) {
    await supabase.storage.from(PATIENT_FILES_BUCKET).remove([storagePath]);
    throw new Error(
      insertError?.message ?? 'Failed to create patient file'
    );
  }
  return mapRow(data as unknown as Record<string, unknown>);
}

export async function getPatientFileDownloadUrl(
  patientId: string,
  fileId: string
): Promise<{ url: string; fileName: string }> {
  const parsedPatientId = parseUuid(patientId, 'patientId');
  const parsedFileId = parseUuid(fileId, 'fileId');
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('patient_files')
    .select(SELECT_COLUMNS)
    .eq('id', parsedFileId)
    .eq('patient_id', parsedPatientId)
    .single();
  if (error || !data) {
    throw new NotFoundError('Patient file');
  }

  const row = data as unknown as Record<string, unknown>;
  const storagePath = row.storage_path as string;
  const fileName = row.file_name as string;
  const { data: signed, error: signError } = await supabase.storage
    .from(PATIENT_FILES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRES_SECONDS, {
      download: fileName,
    });
  if (signError || !signed) {
    throw new Error(signError?.message ?? 'Failed to sign patient file');
  }
  return { url: signed.signedUrl, fileName };
}

export async function deletePatientFile(
  patientId: string,
  fileId: string
): Promise<void> {
  const parsedPatientId = parseUuid(patientId, 'patientId');
  const parsedFileId = parseUuid(fileId, 'fileId');
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('patient_files')
    .select('storage_path')
    .eq('id', parsedFileId)
    .eq('patient_id', parsedPatientId)
    .maybeSingle();
  if (error || !data) {
    throw new NotFoundError('Patient file');
  }
  const storagePath = (data as unknown as Record<string, unknown>)
    .storage_path as string;

  const { error: removeError } = await supabase.storage
    .from(PATIENT_FILES_BUCKET)
    .remove([storagePath]);
  if (removeError) {
    throw new Error(removeError.message);
  }

  const { error: deleteError } = await supabase
    .from('patient_files')
    .delete()
    .eq('id', parsedFileId)
    .eq('patient_id', parsedPatientId);
  if (deleteError) {
    throw new Error(deleteError.message);
  }
}
