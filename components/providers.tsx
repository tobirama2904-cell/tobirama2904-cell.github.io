'use client';
import { useEffect } from 'react';
import { useStore, applyTheme } from '@/lib/store';
import { supaBrowser, isCloud } from '@/lib/supabase/client';
import { usePresence } from '@/lib/realtime';
import { installApiShim } from '@/lib/hybrid/fetch-shim';
import { startNotifyEngine } from '@/lib/hybrid/notify';

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
    setCloud(isCloud());
    const sb = supaBrowser();
    const refreshMe = (u: { id: string; email: string; user_metadata?: { name?: string; avatar_url?: string | null } }) => {
      setMe({ id: u.id, email: u.email || '', name: u.user_metadata?.name || 'Без имени', avatar: u.user_metadata?.avatar_url || null, role: 'user', guest: false });
      sb.from('profiles').select('*').eq('id', u.id).single().then(({ data: p }) => {
        if (p) { setProfile(p as never); setMe({ id: u.id, email: u.email || '', name: p.name, avatar: p.avatar_url, role: p.role, guest: false }); }
      });
      sb.from('activity_log').insert({ user_id: u.id, kind: 'login', detail: 'Вход в систему' }).then(() => {});
      startNotifyEngine();
    };
    sb.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (!u) {
        let name = 'Гость';
        try { name = localStorage.getItem('legion-guest-name') || 'Гость'; } catch {}
        setMe({ id: 'guest', email: '', name, avatar: null, role: 'user', guest: true });
        return;
      }
      refreshMe(u);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_ev, session) => {
      const u = session?.user;
      if (!u) {
        setMe(null); setProfile(null);
      } else {
        refreshMe(u);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [setMe, setProfile, setCloud]);

  return <>{children}</>;
}
