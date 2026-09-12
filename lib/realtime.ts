'use client';
import { useEffect, useRef } from 'react';
import { supaBrowser, isCloud } from './supabase/client';

// Presence: кто онлайн
export function usePresence(uid: string | null, name: string) {
  const ref = useRef<{ unsub: () => void } | null>(null);
  useEffect(() => {
    if (!uid || !isCloud()) return;
    const sb = supaBrowser();
    const ch = sb.channel('online', { config: { presence: { key: uid } } });
    ch.on('presence', { event: 'sync' }, () => {}).subscribe(async st => {
      if (st === 'SUBSCRIBED') await ch.track({ uid, name, at: Date.now() });
    });
    ref.current = { unsub: () => { sb.removeChannel(ch); } };
    const beat = setInterval(() => ch.track({ uid, name, at: Date.now() }), 25000);
    return () => { clearInterval(beat); ref.current?.unsub(); };
  }, [uid, name]);
}
export function useOnlineList(cb: (ids: string[]) => void) {
  useEffect(() => {
    if (!isCloud()) return;
    const sb = supaBrowser();
    const ch = sb.channel('online');
    const pull = () => {
      const st = ch.presenceState() as Record<string, { uid: string }[]>;
      const ids = new Set<string>();
      Object.values(st).forEach(arr => arr.forEach(p => ids.add(p.uid)));
      cb([...ids]);
    };
    ch.on('presence', { event: 'sync' }, pull).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [cb]);
}
// Typing broadcast per convo
export function typingChannel(convoId: string) {
  const sb = supaBrowser();
  const ch = sb.channel('typing:' + convoId, { config: { broadcast: { self: false } } });
  ch.subscribe();
  return {
    send: (uid: string, name: string) => ch.send({ type: 'broadcast', event: 'typing', payload: { uid, name } }),
    onType: (fn: (p: { uid: string; name: string }) => void) => ch.on('broadcast', { event: 'typing' }, ({ payload }) => fn(payload as { uid: string; name: string })),
    close: () => sb.removeChannel(ch),
  };
}
