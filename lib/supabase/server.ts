import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function supaServer() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder',
    { cookies: { getAll: () => jar.getAll(), setAll: cs => { try { cs.forEach(c => jar.set(c)); } catch { /* RSC read-only */ } } } },
  );
}
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || 'tobirama2904@gmail.com').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}
