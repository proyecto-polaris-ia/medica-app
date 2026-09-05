import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '../../supabase/server';
import { PatientIdentityConflictError, resolvePatient, resolvePatientById } from '../patient-resolution';

vi.mock('../../supabase/server', () => ({ getSupabaseAdmin: vi.fn() }));
type Result = { data: unknown; error: any };
function lookup(result: Result) { return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(result) }; }
function insert(result: Result) { return { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue(result) }; }
function conditional(result: Result) { return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(result) }; }
function queue(...queries: any[]) { (getSupabaseAdmin as any).mockReturnValue({ from: vi.fn(() => queries.shift()) }); }
const patient = { id: 'pat-1', full_name: 'María García' };

beforeEach(() => vi.resetAllMocks());
describe('resolvePatient', () => {
  it('creates from email only using a normalized email', async () => {
    const create = insert({ data: { id: 'email-1', full_name: 'María' }, error: null });
    queue(lookup({ data: null, error: null }), create);
    await expect(resolvePatient({ email: ' MARIA@example.COM ', fullName: 'María' })).resolves.toEqual({ id: 'email-1', full_name: 'María' });
    expect(create.insert).toHaveBeenCalledWith(expect.objectContaining({ phone_e164: null, email: 'maria@example.com' }));
  });
  it('uses one patient when phone and email match it', async () => {
    queue(lookup({ data: patient, error: null }), lookup({ data: patient, error: null }));
    await expect(resolvePatient({ phone: '+5215512345678', email: 'maria@example.com' })).resolves.toEqual(patient);
  });
  it('rejects no contact before querying the database', async () => {
    const from = vi.fn(); (getSupabaseAdmin as any).mockReturnValue({ from });
    await expect(resolvePatient({})).rejects.toMatchObject({ field: 'contact' });
    expect(from).not.toHaveBeenCalled();
  });
  it('rejects crossed identities without merging records', async () => {
    queue(lookup({ data: patient, error: null }), lookup({ data: { id: 'pat-2', full_name: 'Juan' }, error: null }));
    await expect(resolvePatient({ phone: '+5215512345678', email: 'juan@example.com' })).rejects.toBeInstanceOf(PatientIdentityConflictError);
  });
  it('enriches only a missing email with a conditional null predicate', async () => {
    const update = conditional({ data: { id: 'pat-1' }, error: null });
    queue(lookup({ data: patient, error: null }), lookup({ data: null, error: null }), update);
    await expect(resolvePatient({ phone: '+5215512345678', email: 'maria@example.com' })).resolves.toEqual(patient);
    expect(update.update).toHaveBeenCalledWith({ email: 'maria@example.com' });
    expect(update.eq).toHaveBeenCalledWith('id', 'pat-1');
    expect(update.is).toHaveBeenCalledWith('email', null);
  });
  it('does not overwrite when a zero-row conditional update cannot be reread as its own value', async () => {
    const update = conditional({ data: null, error: null });
    queue(lookup({ data: patient, error: null }), lookup({ data: null, error: null }), update, lookup({ data: { id: 'pat-2', full_name: 'Other' }, error: null }));
    await expect(resolvePatient({ phone: '+5215512345678', email: 'other@example.com' })).rejects.toBeInstanceOf(PatientIdentityConflictError);
  });
  it('rereads after a 23505 insert race and returns the competing row', async () => {
    queue(lookup({ data: null, error: null }), insert({ data: null, error: { code: '23505', message: 'duplicate' } }), lookup({ data: { id: 'race-1', full_name: 'Race' }, error: null }));
    await expect(resolvePatient({ email: 'race@example.com' })).resolves.toEqual({ id: 'race-1', full_name: 'Race' });
  });
  it('rejects an insert race when its reread contacts belong to different patients', async () => {
    queue(
      lookup({ data: null, error: null }),
      lookup({ data: null, error: null }),
      insert({ data: null, error: { code: '23505', message: 'duplicate' } }),
      lookup({ data: patient, error: null }),
      lookup({ data: { id: 'pat-2', full_name: 'Juan' }, error: null }),
    );

    await expect(resolvePatient({ phone: '+5215512345678', email: 'juan@example.com' })).rejects.toBeInstanceOf(PatientIdentityConflictError);
  });
  it('finds an existing patient directly from phone only', async () => {
    queue(lookup({ data: patient, error: null }));

    await expect(resolvePatient({ phone: '+5215512345678', fullName: 'María' })).resolves.toEqual(patient);
  });
  it('creates a patient directly from phone only when it is unknown', async () => {
    const create = insert({ data: patient, error: null });
    queue(lookup({ data: null, error: null }), create);

    await expect(resolvePatient({ phone: '+5215512345678', fullName: 'María' })).resolves.toEqual(patient);
    expect(create.insert).toHaveBeenCalledWith(expect.objectContaining({ phone_e164: '+5215512345678', email: null }));
  });
  it('allows exactly one concurrent conditional email completion and persists its winner', async () => {
    let persistedEmail: string | null = null;
    let emailLookups = 0;
    let releaseEmailLookups: (() => void) | undefined;
    const emailLookupsReady = new Promise<void>((resolve) => {
      releaseEmailLookups = resolve;
    });
    const updates: string[] = [];

    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn((field: string, value: string) => ({
            maybeSingle: vi.fn(async () => {
              if (field === 'phone_e164') return { data: patient, error: null };

              const owner = persistedEmail === value ? patient : null;
              emailLookups += 1;
              if (emailLookups === 2) releaseEmailLookups?.();
              await emailLookupsReady;
              return { data: owner, error: null };
            }),
          })),
        })),
        update: vi.fn((payload: { email: string }) => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => {
                  updates.push(payload.email);
                  if (persistedEmail === null) {
                    persistedEmail = payload.email;
                    return { data: { id: patient.id }, error: null };
                  }
                  return { data: null, error: null };
                }),
              })),
            })),
          })),
        })),
      })),
    };
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(client);

    const results = await Promise.allSettled([
      resolvePatient({ phone: '+5215512345678', email: 'one@example.com' }),
      resolvePatient({ phone: '+5215512345678', email: 'two@example.com' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')[0]).toMatchObject({
      reason: expect.any(PatientIdentityConflictError),
    });
    expect(updates).toHaveLength(2);
    expect(['one@example.com', 'two@example.com']).toContain(persistedEmail);
  });
});
describe('resolvePatientById', () => {
  it('returns the patient when found', async () => { queue(lookup({ data: patient, error: null })); await expect(resolvePatientById('pat-1')).resolves.toEqual(patient); });
  it('throws NotFoundError when missing', async () => { queue(lookup({ data: null, error: null })); await expect(resolvePatientById('missing')).rejects.toThrow('Patient not found'); });
});
