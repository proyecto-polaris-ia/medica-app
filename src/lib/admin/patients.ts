import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { Patient, PatientInput } from './types';
import {
  parseDate,
  parseNonEmptyString,
  parseOptionalString,
  parsePhoneE164,
  parseSex,
  parseUuid,
  ValidationError,
} from './validate';
import { ConflictError } from './errors';
import { normalizePatientContact, parseOptionalEmail } from '@/lib/booking/patient-contact';

const SELECT_COLUMNS = 'id, full_name, phone_e164, email, notes, birth_date, sex, address, occupation, referral_source, secondary_phone, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, created_at, updated_at';
function mapRow(row: Record<string, unknown>): Patient {
  return {
    id: row.id as string,
    fullName: row.full_name as string,
    phoneE164: (row.phone_e164 as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    birthDate: (row.birth_date as string | null) ?? null,
    sex: (row.sex as Patient['sex']) ?? null,
    address: (row.address as string | null) ?? null,
    occupation: (row.occupation as string | null) ?? null,
    referralSource: (row.referral_source as string | null) ?? null,
    secondaryPhone: (row.secondary_phone as string | null) ?? null,
    emergencyContactName: (row.emergency_contact_name as string | null) ?? null,
    emergencyContactPhone: (row.emergency_contact_phone as string | null) ?? null,
    emergencyContactRelationship: (row.emergency_contact_relationship as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
function parseOptionalPhone(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return parsePhoneE164(trimmed, 'secondaryPhone');
}
function validatePatientInput(input: PatientInput) {
  const contact = normalizePatientContact({ phone: input.phoneE164, email: input.email });
  return {
    full_name: parseNonEmptyString(input.fullName, 'fullName'),
    phone_e164: contact.phone ?? null,
    email: contact.email ?? null,
    notes: input.notes,
    birth_date: parseDate(input.birthDate, 'birthDate'),
    sex: parseSex(input.sex),
    address: parseOptionalString(input.address),
    occupation: parseOptionalString(input.occupation),
    referral_source: parseOptionalString(input.referralSource),
    secondary_phone: parseOptionalPhone(input.secondaryPhone),
    emergency_contact_name: parseOptionalString(input.emergencyContactName),
    emergency_contact_phone: parseOptionalPhone(input.emergencyContactPhone),
    emergency_contact_relationship: parseOptionalString(input.emergencyContactRelationship),
  };
}
function throwPatientError(error: { code?: string; message?: string } | null | undefined, fallback: string): never {
  if (error?.code === '23505') throw new ConflictError('Contact already registered', 'contact_conflict');
  throw new Error(error?.message ?? fallback);
}
export const PATIENTS_DEFAULT_PAGE = 1;
export const PATIENTS_DEFAULT_PAGE_SIZE = 20;
export const PATIENTS_MAX_PAGE_SIZE = 100;

export type PatientsPage = {
  patients: Patient[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Normaliza los parámetros de paginación de entrada (design.md, Decisión 1).
 * `null`, `''`, `'abc'`, `0`, negativos y no enteros caen a los defaults;
 * `pageSize` se satura a `PATIENTS_MAX_PAGE_SIZE`.
 */
export function normalizePatientsPagination(
  page: unknown,
  pageSize: unknown
): { page: number; pageSize: number } {
  const normalizedPage = parsePositiveInt(page) ?? PATIENTS_DEFAULT_PAGE;
  const requestedSize = parsePositiveInt(pageSize) ?? PATIENTS_DEFAULT_PAGE_SIZE;
  return {
    page: normalizedPage,
    pageSize: Math.min(requestedSize, PATIENTS_MAX_PAGE_SIZE),
  };
}

/**
 * Cita y escapa un término para `ilike` dentro de `.or()` (design.md, Decisión 2).
 * Devuelve `"%término%"`: las comillas protegen `,`, `(` y `)` del separador de
 * `.or()` y `%`/`_` se vuelven literales en lugar de comodines LIKE.
 *
 * Dos niveles de escape (verificado contra el PostgREST local, tarea 1.5):
 * 1. el payload de LIKE necesita `\%`, `\_` y `\\` para ser literal;
 * 2. el valor citado de PostgREST des-escapa un nivel (`\\` → `\`, `\%` → `%`),
 *    así que cada barra invertida se duplica y la comilla se envía como `\"`.
 * Con una sola barra, PostgREST la consume y `%`/`_` vuelven a ser comodines.
 */
export function escapePostgrestIlikeTerm(value: string): string {
  const literalLike = value
    .replace(/\\/g, '\\\\') // barra invertida literal
    .replace(/%/g, '\\%') // comodín LIKE → literal
    .replace(/_/g, '\\_'); // comodín LIKE → literal
  const forQuotedValue = literalLike
    .replace(/\\/g, '\\\\') // PostgREST des-escapa un nivel dentro de comillas
    .replace(/"/g, '\\"'); // cierre del valor citado de PostgREST
  return `"%${forQuotedValue}%"`;
}

/** Filtro `.or()` compartido por la lectura paginada y por `searchPatients`. */
function patientsIlikeOrFilter(term: string): string {
  const escaped = escapePostgrestIlikeTerm(term);
  return `full_name.ilike.${escaped},phone_e164.ilike.${escaped},email.ilike.${escaped}`;
}

export async function listPatients(): Promise<Patient[]> { const { data, error } = await getSupabaseAdmin().from('patients').select(SELECT_COLUMNS).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return (data ?? []).map(mapRow); }
function totalPagesFor(totalCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}

/** Query base del listado con el filtro opcional ya escapado (o sin filtro). */
function patientsListQuery(term: string, head = false) {
  const base = getSupabaseAdmin()
    .from('patients')
    .select(SELECT_COLUMNS, { count: 'exact', head });
  return term ? base.or(patientsIlikeOrFilter(term)) : base;
}

/** Total exacto del listado filtrado, sin traer filas (páginas fuera de rango). */
async function countPatients(term: string): Promise<number> {
  const { count, error } = await patientsListQuery(term, true).range(0, 0);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Lectura paginada y filtrada del listado administrativo (design.md, Decisión 1).
 *
 * El filtro se aplica antes de `range()` y `totalCount` sale del `count:'exact'`
 * del mismo query, de modo que `total`/`totalPages` describen el resultado ya
 * filtrado. Orden estable: `created_at` desc con desempate `id` desc.
 */
export async function listPatientsPage(
  input: { q?: string; page?: number; pageSize?: number } = {}
): Promise<PatientsPage> {
  const { page, pageSize } = normalizePatientsPagination(input.page, input.pageSize);
  const term = (input.q ?? '').trim();
  const from = (page - 1) * pageSize;
  const { data, error, count } = await patientsListQuery(term)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    // PGRST103: la página solicitada excede el total. No es un error de
    // negocio: la lectura responde con `patients` vacío y los metadatos reales.
    if (error.code === 'PGRST103') {
      const totalCount = await countPatients(term);
      return {
        patients: [],
        page,
        pageSize,
        totalCount,
        totalPages: totalPagesFor(totalCount, pageSize),
      };
    }
    throw new Error(error.message);
  }

  const totalCount = count ?? 0;
  return {
    patients: (data ?? []).map(mapRow),
    page,
    pageSize,
    totalCount,
    totalPages: totalPagesFor(totalCount, pageSize),
  };
}
export async function getPatient(id: string): Promise<Patient | null> { const parsedId = parseUuid(id, 'id'); const { data, error } = await getSupabaseAdmin().from('patients').select(SELECT_COLUMNS).eq('id', parsedId).maybeSingle(); if (error) throw new Error(error.message); return data ? mapRow(data) : null; }
export async function searchPatients(q: string): Promise<Patient[]> { const trimmed=q.trim(); if(!trimmed)return []; const {data,error}=await getSupabaseAdmin().from('patients').select(SELECT_COLUMNS).or(patientsIlikeOrFilter(trimmed)).order('created_at',{ascending:false}); if(error)throw new Error(error.message); return (data??[]).map(mapRow); }
export async function createPatient(input: PatientInput): Promise<Patient> { const {data,error}=await getSupabaseAdmin().from('patients').insert(validatePatientInput(input)).select(SELECT_COLUMNS).single(); if(error||!data) throwPatientError(error,'Failed to create patient'); return mapRow(data); }
export async function updatePatient(id:string,input:PatientInput):Promise<Patient>{const payload=validatePatientInput(input);const parsedId=parseUuid(id,'id');const {data,error}=await getSupabaseAdmin().from('patients').update(payload).eq('id',parsedId).select(SELECT_COLUMNS).single();if(error||!data)throwPatientError(error,'Patient not found');return mapRow(data)}
/**
 * Actualiza **solo** el email del paciente (design.md D8).
 *
 * Escritura targeted para el onboarding: nunca reconstruye el resto de campos
 * (a diferencia de `updatePatient`, que es full-replace) y jamás toca la
 * historia clínica. Un correo ya registrado por otro paciente (`23505`) es un
 * conflicto de identidad. `undefined`/vacío es un dato faltante, no una limpieza.
 */
export async function updatePatientEmail(patientId: string, email: string): Promise<Patient> {
  const parsedId = parseUuid(patientId, 'id');
  const parsedEmail = parseOptionalEmail(email);
  if (!parsedEmail) throw new ValidationError('email', 'Invalid email');
  const { data, error } = await getSupabaseAdmin()
    .from('patients')
    .update({ email: parsedEmail })
    .eq('id', parsedId)
    .select(SELECT_COLUMNS)
    .single();
  if (error || !data) throwPatientError(error, 'Patient not found');
  return mapRow(data);
}
export async function deletePatient(id:string):Promise<void>{const {error}=await getSupabaseAdmin().from('patients').delete().eq('id',parseUuid(id,'id'));if(error)throw new Error(error.message)}
