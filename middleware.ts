import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes('placeholder')) return res;
  const sb = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: cs => cs.forEach(c => res.cookies.set(c)),
    },
  });
  await sb.auth.getUser();
  return res;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icon.svg).*)'] };
