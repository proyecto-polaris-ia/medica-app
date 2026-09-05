import { describe, expect, it, vi } from 'vitest';
import { getWccContactsList } from './wcc-contacts';

vi.mock('@/lib/wcc-client', () => ({ createWccClient: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));
import { createWccClient } from '@/lib/wcc-client';

function query(data: Record<string, unknown>[], count?: number) {
  const value = Promise.resolve({ data, error: null, count });
  return Object.assign(value, { select: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn() });
}

describe('getWccContactsList', () => {
  it('keeps WhatsApp contact phone mandatory while the linked patient phone can be null', async () => {
    vi.mocked(createWccClient).mockResolvedValue({ from: vi.fn((table: string) => table === 'whatsapp_contacts'
      ? query([{ id: 'contact-1', phone_e164: '+5215512345678', linked_patient_id: 'patient-1', opt_in_status: 'opted_in', first_seen_at: 'a', last_seen_at: 'b', created_at: 'a' }], 1)
      : query([{ id: 'patient-1', full_name: 'María', phone_e164: null, email: 'maria@example.com' }])) } as never);
    const result = await getWccContactsList();
    expect(result.contacts[0]).toMatchObject({ phoneE164: '+5215512345678', linkedPatient: { phoneE164: null, email: 'maria@example.com' } });
  });
});
