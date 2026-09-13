'use client';
import { useEffect } from 'react';
import { isCloud } from './supabase/client';
import { announce, onOnline, sendTyping, onTyping } from './hybrid/live';

// Presence: кто онлайн (P2P lobby, без серверов)
export function usePresence(uid: string | null, name: string) {
  useEffect(() => {
    if (!uid || !isCloud()) return;
    let stop = false;
    announce(uid, name, null).catch(() => {});
    const beat = setInterval(() => { if (!stop) announce(uid, name, null).catch(() => {}); }, 25000);
    return () => { stop = true; clearInterval(beat); };
  }, [uid, name]);
}
export function useOnlineList(cb: (ids: string[]) => void) {
  useEffect(() => {
    if (!isCloud()) return;
    return onOnline(cb);
  }, [cb]);
}
// Typing broadcast per convo
export function typingChannel(convoId: string) {
  let off: (() => void) | null = null;
  let fn: ((p: { uid: string; name: string }) => void) | null = null;
  onTyping(convoId, (m: unknown) => {
    const mm = m as { payload?: { uid: string; name: string } };
    if (fn && mm?.payload) fn(mm.payload);
  }).then(o => { off = o; }).catch(() => {});
  return {
    send: (uid: string, name: string) => sendTyping(convoId, { event: 'typing', payload: { uid, name } }),
    onType: (f: (p: { uid: string; name: string }) => void) => { fn = f; },
    close: () => { try { off?.(); } catch {} },
  };
}
