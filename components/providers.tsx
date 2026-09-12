'use client';
import { useEffect } from 'react';
import { CopilotKit } from '@copilotkit/react-core';
import { useStore, applyTheme } from '@/lib/store';
import { supaBrowser, isCloud } from '@/lib/supabase/client';
import { usePresence } from '@/lib/realtime';

export function Providers({ children }: { children: React.ReactNode }) {
  const theme = useStore(s => s.theme);
  const setMe = useStore(s => s.setMe);
  const setProfile = useStore(s => s.setProfile);
  const setCloud = useStore(s => s.setCloud);
  const me = useStore(s => s.me);
  usePresence(me?.guest ? null : me?.id || null, me?.name || '');

  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    const cloud = isCloud();
    setCloud(cloud);
    if (!cloud) {
      let name = 'Гость';
      try { name = localStorage.getItem('legion-guest-name') || 'Гость'; } catch {}
      setMe({ id: 'guest', email: '', name, avatar: null, role: 'user', guest: true });
      return;
    }
    const sb = supaBrowser();
    sb.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (!u) { setMe(null); return; }
      setMe({ id: u.id, email: u.email || '', name: u.user_metadata?.name || u.email?.split('@')[0] || 'Без имени', avatar: u.user_metadata?.avatar_url || null, role: 'user', guest: false });
      sb.from('profiles').select('*').eq('id', u.id).single().then(({ data: p }) => {
        if (p) { setProfile(p as never); setMe({ id: u.id, email: u.email || '', name: p.name, avatar: p.avatar_url, role: p.role, guest: false }); }
      });
      sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', u.id).then(() => {});
      sb.from('activity_log').insert({ user_id: u.id, kind: 'login', detail: 'Вход в систему' }).then(() => {});
    });
    const { data: sub } = sb.auth.onAuthStateChange((_ev, session) => {
      const u = session?.user;
      if (!u) { setMe(null); setProfile(null); }
    });
    return () => sub.subscription.unsubscribe();
  }, [setMe, setProfile, setCloud]);

  return <CopilotKit runtimeUrl="/api/copilotkit" showDevConsole={false}>{children}</CopilotKit>;
}
