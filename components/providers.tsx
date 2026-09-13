'use client';
import { useEffect } from 'react';
import { useStore, applyTheme } from '@/lib/store';
import { usePresence } from '@/lib/realtime';
import { installApiShim } from '@/lib/hybrid/fetch-shim';
import { startNotifyEngine } from '@/lib/hybrid/notify';
import { loadSession, onAuth, type Session } from '@/lib/hybrid/identity';
import { getProfile } from '@/lib/hybrid/social';
import { loadBanlist } from '@/lib/hybrid/banlist';

export function Providers({ children }: { children: React.ReactNode }) {
  const theme = useStore(s => s.theme);
  const setMe = useStore(s => s.setMe);
  const setProfile = useStore(s => s.setProfile);
  const setCloud = useStore(s => s.setCloud);
  const me = useStore(s => s.me);
  usePresence(me?.guest ? null : me?.id || null, me?.name || '');

  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    installApiShim();
    setCloud(true); // hybrid rails are always on
    let dead = false;
    const apply = async (s: Session | null) => {
      if (!s) {
        let name = 'Гость';
        try { name = localStorage.getItem('legion-guest-name') || 'Гость'; } catch {}
        if (!dead) { setMe({ id: 'guest', email: '', name, avatar: null, role: 'user', guest: true }); setProfile(null); }
        return;
      }
      // instant shell from session, then enrich from relays (name/avatar/role)
      if (!dead) setMe({ id: s.id, email: s.email, name: s.name, avatar: s.avatar, role: 'user', guest: false });
      startNotifyEngine();
      try {
        const [p] = await Promise.all([getProfile(s.id), loadBanlist()]);
        if (dead) return;
        setProfile(p as never);
        setMe({ id: s.id, email: s.email, name: p.name || s.name, avatar: p.avatar_url || s.avatar, role: p.role, guest: false });
      } catch {
        if (!dead) setMe({ id: s.id, email: s.email, name: s.name, avatar: s.avatar, role: 'user', guest: false });
      }
    };
    apply(loadSession());
    const off = onAuth(ss => { apply(ss); });
    return () => { dead = true; off(); };
  }, [setMe, setProfile, setCloud]);

  return <>{children}</>;
}
