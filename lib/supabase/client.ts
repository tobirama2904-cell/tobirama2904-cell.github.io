'use client';
import { createBrowserClient } from '@supabase/ssr';

let _sb: ReturnType<typeof createBrowserClient> | null = null;
export function supaBrowser() {
  if (!_sb) {
    _sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder',
    );
  }
  return _sb;
}
export function isCloud(): boolean {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return u.startsWith('https://') && !u.includes('placeholder') && (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').length > 20;
}
