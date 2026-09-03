import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseEnv } from './auth';

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

export async function updateSession(request: NextRequest) {
  const { url, anonKey } = getSupabaseEnv();

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
        );
      },
    },
  });

  // Refresh the session if expired. Must be called before returning.
  await supabase.auth.getUser();

  return supabaseResponse;
}
