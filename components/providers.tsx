'use client';
import { useEffect, useState } from 'react';
import { APP_VERSION } from '@/lib/version';
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
  const [newVer, setNewVer] = useState('');
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
  // self-update: if live version.json is newer, offer one-tap force refresh (unsticks ancient caches)
  useEffect(() => {
    let dead = false;
    const check = async () => {
      try {
        const r = await fetch('/version.json', { cache: 'no-store' });
        const j = await r.json();
        if (!dead && j && typeof j.version === 'string' && j.version !== APP_VERSION) setNewVer(j.version);
      } catch {}
    };
    check();
    const t = setInterval(check, 60000);
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { dead = true; clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  const forceUpdate = async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((regs || []).map(r => r.unregister().catch(() => {})));
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));
    } catch {}
    location.reload();
  };

  return <>{children}{newVer && <div className="fixed z-[100] bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-2xl bg-zinc-950 text-white pl-4 pr-2 py-2 shadow-2xl border border-white/15 max-w-[calc(100vw-2rem)]">
    <span className="text-xs font-bold whitespace-nowrap">⬆ Вышла {newVer} — обновить?</span>
    <button onClick={forceUpdate} className="px-4 py-2 rounded-xl bg-blue-600 text-xs font-bold hover:bg-blue-500 shrink-0">Обновить</button>
  </div>}</>;
}
