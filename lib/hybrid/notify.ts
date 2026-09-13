// Notifications: derived live from Nostr events (likes, follows, DMs, mentions,
// announcements), stored on-device. Offline fallback: Telegram bot ping.
import { nsub, ts } from './nostr';
import { RELAYS, TG_BOT_TOKEN, T_ANN } from './config';
import { loadSession } from './identity';
import type { Notification } from '../supabase/types';

const K = 'legion-notif-v1';
function load(): Notification[] {
  try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch { return []; }
}
function save(n: Notification[]) {
  try { localStorage.setItem(K, JSON.stringify(n.slice(0, 150))); } catch {}
}
const pushCbs = new Set<(n: Notification) => void>();
export function onPush(cb: (n: Notification) => void): () => void {
  pushCbs.add(cb);
  return () => { pushCbs.delete(cb); };
}
export function pushNotif(n: { user_id: string; kind: string; title: string; body: string; link?: string | null }): Notification {
  const row: Notification = {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    user_id: n.user_id, kind: n.kind, title: n.title, body: n.body,
    link: n.link || null, read: false, created_at: new Date().toISOString(),
  };
  const all = load();
  all.unshift(row);
  save(all);
  pushCbs.forEach(f => { try { f(row); } catch {} });
  return row;
}
export function listNotifs(userId: string): Notification[] {
  return load().filter(n => n.user_id === userId);
}
export function unreadCount(userId: string): number {
  return load().filter(n => n.user_id === userId && !n.read).length;
}
export function markAllRead(userId: string) {
  save(load().map(n => (n.user_id === userId ? { ...n, read: true } : n)));
}
// compat for notifications.insert(rows): store mine; admin announce -> publish once
export async function insertCompat(rows: { user_id: string; kind: string; title: string; body: string; link?: string }[]): Promise<void> {
  const me = loadSession();
  const ann = rows.find(r => r.kind === 'announce');
  if (ann && me) {
    const { publishAnnouncement } = await import('./social');
    await publishAnnouncement(ann.title.replace(/^📢 /, ''), ann.body).catch(() => {});
    pushNotif({ user_id: me.id, kind: 'announce', title: ann.title, body: ann.body });
    return;
  }
  if (!me) return;
  rows.filter(r => r.user_id === me.id).forEach(r => pushNotif(r));
}

let engine = false;
export function startNotifyEngine() {
  const s = loadSession();
  if (!s || engine) return;
  engine = true;
  const since = ts();
  nsub(RELAYS, { kinds: [7], '#p': [s.id], since }, () => {
    pushNotif({ user_id: s.id, kind: 'like', title: 'Новый лайк', body: 'Кто-то оценил ваш пост', link: '/feed' });
  });
  nsub(RELAYS, { kinds: [3], '#p': [s.id], since }, () => {
    pushNotif({ user_id: s.id, kind: 'follow', title: 'Новый подписчик', body: 'На вас подписались', link: '/users' });
  });
  nsub(RELAYS, { kinds: [4], '#p': [s.id], since }, () => {
    pushNotif({ user_id: s.id, kind: 'message', title: 'Новое сообщение', body: 'Вам написали', link: '/messages' });
    tgPing('💬 Новое сообщение в LEGION');
  });
  nsub(RELAYS, { kinds: [1], '#t': [T_ANN], since }, e => {
    const [t, ...rest] = e.content.split('\n');
    pushNotif({ user_id: s.id, kind: 'announce', title: '📢 ' + t, body: rest.join('\n').slice(0, 120), link: '/feed' });
  });
  nsub(RELAYS, { kinds: [1], '#p': [s.id], since }, () => {
    pushNotif({ user_id: s.id, kind: 'mention', title: 'Упоминание', body: 'Вас упомянули', link: '/feed' });
  });
}
async function tgPing(text: string) {
  const s = loadSession();
  if (!s?.tg || !TG_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: s.tg.id, text }),
    });
  } catch {}
}
