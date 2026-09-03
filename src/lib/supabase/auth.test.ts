import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSupabaseServerClient,
  getCurrentUser,
  requireUser,
  UnauthorizedError,
} from './auth';

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

describe('auth', () => {
  const mockCookieStore = {
    getAll: vi.fn(),
    set: vi.fn(),
  };
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue(mockCookieStore);
    (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabase
    );
  });

  describe('createSupabaseServerClient', () => {
    it('throws when env vars are missing', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      await expect(createSupabaseServerClient()).rejects.toThrow(
        /Missing Supabase config/
      );
    });
  });

  describe('getCurrentUser', () => {
    it('returns null when auth.getUser returns an error', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('no session'),
      });

      const user = await getCurrentUser();

      expect(user).toBeNull();
    });

    it('returns null when there is no user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const user = await getCurrentUser();

      expect(user).toBeNull();
    });

    it('returns the user when authenticated', async () => {
      const expectedUser = { id: 'user-1', email: 'a@b.c' };
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: expectedUser },
        error: null,
      });

      const user = await getCurrentUser();

      expect(user).toEqual(expectedUser);
    });
  });

  describe('requireUser', () => {
    it('throws UnauthorizedError when unauthenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('no session'),
      });

      await expect(requireUser()).rejects.toThrow(UnauthorizedError);
    });

    it('returns the user when authenticated', async () => {
      const expectedUser = { id: 'user-1', email: 'a@b.c' };
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: expectedUser },
        error: null,
      });

      const user = await requireUser();

      expect(user).toEqual(expectedUser);
    });
  });
});
