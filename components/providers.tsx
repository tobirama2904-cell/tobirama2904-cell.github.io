'use client';
import { useEffect } from 'react';
import { useStore, applyTheme, resolveTheme } from '@/lib/store';
import { usePresence } from '@/lib/realtime';
import { installApiShim } from '@/lib/hybrid/fetch-shim';
import { startNotifyEngine } from '@/lib/hybrid/notify';
import { loadSession, onAuth, type Session } from '@/lib/hybrid/identity';
import { getProfile } from '@/lib/hybrid/social';
import { loadBanlist } from '@/lib/hybrid/banlist';
import { ADMIN_EMAILS } from '@/lib/hybrid/config';

export function Providers({ children }: { children: React.ReactNode }) {
  const theme = useStore(s => s.theme);
  const setMe = useStore(s => s.setMe);
  const setProfile = useStore(s => s.setProfile);
  const setCloud = useStore(s => s.setCloud);
  const me = useStore(s => s.me);
  usePresence(me?.guest ? null : me?.id || null, me?.name || '');

  useEffect(() => { try { const t = resolveTheme(); if (t !== theme) useStore.getState().setTheme(t); applyTheme(t); } catch {} }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    installApiShim();
    try {
      if (!(console.error as unknown as { __legionPatched?: boolean }).__legionPatched) {
        const origErr = console.error.bind(console);
        const benign = /User-Initiated Abort|Close called|Trystero peer error.*(Abort|Close)|WebSocket connection to 'wss:/;
        console.error = ((...a: unknown[]) => {
          try { if (benign.test(a.map(String).join(' '))) { console.debug(...a); return; } } catch {}
          origErr(...a);
        }) as typeof console.error;
        (console.error as unknown as { __legionPatched?: boolean }).__legionPatched = true;
      }
    } catch {}
    setCloud(true); // hybrid rails are always on
    let dead = false;
    const apply = async (s: Session | null) => {
      if (!s) {
        let name = 'Гость';
        try { name = localStorage.getItem('legion-guest-name') || 'Гость'; } catch {}
        if (!dead) { setMe({ id: 'guest', email: '', name, avatar: null, role: 'user', guest: true }); setProfile(null); }
        return;
      }
      // instant shell from session (owner email => admin immediately, no relay wait), then enrich from relays
      const instRole = ADMIN_EMAILS.includes(s.email.trim().toLowerCase()) ? 'admin' : 'user';
      if (!dead) setMe({ id: s.id, email: s.email, name: s.name, avatar: s.avatar, role: instRole, guest: false });
      startNotifyEngine();
      try {
        const [p] = await Promise.all([getProfile(s.id), loadBanlist()]);
        if (dead) return;
        setProfile(p as never);
        setMe({ id: s.id, email: s.email, name: (!p.name || p.name.startsWith('nostr:') ? s.name : p.name), avatar: p.avatar_url || s.avatar, role: instRole === 'admin' ? 'admin' : p.role, guest: false });
      } catch {
        if (!dead) setMe({ id: s.id, email: s.email, name: s.name, avatar: s.avatar, role: instRole, guest: false });
      }
    };
    apply(loadSession());
    const off = onAuth(ss => { apply(ss); });
    return () => { dead = true; off(); };
  }, [setMe, setProfile, setCloud]);

  return <>{children}</>;
}
