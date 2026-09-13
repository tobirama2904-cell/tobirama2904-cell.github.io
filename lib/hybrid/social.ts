// LEGION social graph on Nostr: kind-0 profiles, kind-1 posts/comments,
// kind-6 reposts, kind-7 likes, kind-3 follows, kind-10000 mutes, kind-1984 reports.
import type { Event as NEvent } from 'nostr-tools';
import { nquery, npublish, nsub, tag, tags, ts, iso } from './nostr';
import { T_POST, T_STORY, T_ANN, T_BOT, READ_RELAYS, RELAYS } from './config';
import { loadSession } from './identity';
import { loadBanlist } from './banlist';
import type { Profile, Post, Comment, Story, Report } from '../supabase/types';

// ---------- tombstones (local deletes) ----------
const TOMB_K = 'legion-tomb-v1';
function tombs(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(TOMB_K) || '[]')); } catch { return new Set(); }
}
export function isTomb(id: string): boolean { return tombs().has(id); }
function addTomb(id: string) {
  try {
    const t = tombs(); t.add(id);
    localStorage.setItem(TOMB_K, JSON.stringify([...t].slice(-2000)));
  } catch {}
}

// ---------- profiles (kind 0) ----------
interface K0 { name?: string; about?: string; picture?: string; banner?: string; legion_status?: string; legion_private?: boolean }
const pcache = new Map<string, { at: number; p: Profile; raw: K0 }>();
export function blankProfile(pub: string): Profile {
  const now = new Date().toISOString();
  return {
    id: pub, email: '', name: 'nostr:' + pub.slice(0, 8), avatar_url: null, cover_url: null,
    bio: '', status: '', role: 'user', verified: false, is_private: false, last_seen: now, created_at: now,
  };
}
export async function getProfile(pub: string): Promise<Profile> {
  const c = pcache.get(pub);
  if (c && Date.now() - c.at < 120e3) return c.p;
  const p = blankProfile(pub);
  try {
    const evs = await nquery({ kinds: [0], authors: [pub], limit: 1 }, READ_RELAYS, 4500);
    const e = evs[0];
    if (e) {
      let j: K0 = {};
      try { j = JSON.parse(e.content); } catch {}
      p.name = j.name || p.name;
      p.bio = j.about || '';
      p.avatar_url = j.picture || null;
      p.cover_url = j.banner || null;
      p.status = j.legion_status || '';
      p.is_private = !!j.legion_private;
      p.created_at = iso(e.created_at);
      p.last_seen = iso(e.created_at);
      pcache.set(pub, { at: Date.now(), p, raw: j });
    }
  } catch {}
  const me = loadSession();
  if (me && me.id === pub) {
    p.email = me.email;
    if (me.name && (p.name.startsWith('nostr:') || me.name !== p.name)) { /* keep published name */ }
    p.last_seen = new Date().toISOString();
  }
  try {
    const bl = await loadBanlist();
    if (bl.roles[pub]) p.role = bl.roles[pub] as Profile['role'];
    if (bl.admins.includes(pub)) p.role = 'admin';
    if (bl.verified.includes(pub)) p.verified = true;
    if (bl.banned.includes(pub)) p.status = '⛔ banned';
  } catch {}
  return p;
}
export async function listProfiles(limit = 100): Promise<Profile[]> {
  const out = new Map<string, Profile>();
  try {
    const evs = await nquery({ kinds: [0], limit: Math.min(200, limit * 2) }, READ_RELAYS, 6000);
    for (const e of evs) {
      if (out.has(e.pubkey)) continue;
      let j: K0 = {};
      try { j = JSON.parse(e.content); } catch {}
      if (!j.name && !j.picture) continue;
      out.set(e.pubkey, {
        ...blankProfile(e.pubkey), name: j.name || blankProfile(e.pubkey).name,
        bio: j.about || '', avatar_url: j.picture || null, cover_url: j.banner || null,
        status: j.legion_status || '', is_private: !!j.legion_private,
        created_at: iso(e.created_at), last_seen: iso(e.created_at),
      });
    }
  } catch {}
  // always include self + cached peers
  const me = loadSession();
  if (me && !out.has(me.id)) out.set(me.id, await getProfile(me.id));
  try {
    const bl = await loadBanlist();
    out.forEach(p => {
      if (bl.roles[p.id]) p.role = bl.roles[p.id] as Profile['role'];
      if (bl.admins.includes(p.id)) p.role = 'admin';
      if (bl.verified.includes(p.id)) p.verified = true;
    });
  } catch {}
  return [...out.values()].slice(0, limit);
}
export async function saveProfile(patch: { name?: string; bio?: string; status?: string; avatar_url?: string | null; cover_url?: string | null; is_private?: boolean }): Promise<Profile | null> {
  const s = loadSession();
  if (!s) return null;
  let cur: K0 = pcache.get(s.id)?.raw || {};
  if (!pcache.get(s.id)) {
    try {
      const evs = await nquery({ kinds: [0], authors: [s.id], limit: 1 }, READ_RELAYS, 4000);
      if (evs[0]) { try { cur = JSON.parse(evs[0].content); } catch {} }
    } catch {}
  }
  const next: K0 = {
    ...cur,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.bio !== undefined ? { about: patch.bio } : {}),
    ...(patch.status !== undefined ? { legion_status: patch.status } : {}),
    ...(patch.avatar_url !== undefined ? { picture: patch.avatar_url || '' } : {}),
    ...(patch.cover_url !== undefined ? { banner: patch.cover_url || '' } : {}),
    ...(patch.is_private !== undefined ? { legion_private: patch.is_private } : {}),
  };
  const { ok } = await npublish({ kind: 0, content: JSON.stringify(next), tags: [['t', T_POST]] }, s.sk);
  if (ok) pcache.delete(s.id);
  return getProfile(s.id);
}

// ---------- posts (kind 1 + #legion) ----------
const IMG_URL = /(https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?)\s*$/i;
export function parsePost(e: NEvent): Post {
  let text = e.content;
  let image: string | null = tag(e, 'image') || null;
  const m = text.match(IMG_URL);
  if (!image && m) image = m[1];
  if (m) text = text.slice(0, m.index).trim();
  return {
    id: e.id, author_id: e.pubkey, text, image_url: image,
    likes: 0, comments: 0, reposts: 0, created_at: iso(e.created_at),
  };
}
export async function fillCounts(list: Post[]): Promise<void> {
  if (!list.length) return;
  const me = loadSession()?.id;
  const chunks: string[][] = [];
  const ids = list.map(p => p.id);
  for (let i = 0; i < ids.length; i += 40) chunks.push(ids.slice(i, i + 40));
  const all: NEvent[] = [];
  await Promise.all(chunks.map(async c => {
    const evs = await nquery({ kinds: [1, 6, 7], '#e': c, limit: 500 }, READ_RELAYS, 6000);
    all.push(...evs);
  }));
  const byId = new Map(list.map(p => [p.id, p]));
  for (const e of all) {
    const ref = tag(e, 'e');
    if (!ref) continue;
    const p = byId.get(ref);
    if (!p) continue;
    if (e.kind === 7 && e.content !== '-') {
      p.likes++;
      if (me && e.pubkey === me) p.liked = true;
    } else if (e.kind === 6) {
      p.reposts++;
      if (me && e.pubkey === me) p.reposted = true;
    } else if (e.kind === 1) {
      // exclude repost/comment loops: count kind-1 replies as comments
      if (!e.tags.some(t => t[0] === 't' && t[1] === T_POST && e.tags.some(x => x[0] === 'e' && x[3] === 'root') ? false : false)) p.comments++;
    }
  }
}
export async function getPosts(opts: { author?: string; limit?: number; since?: number } = {}): Promise<Post[]> {
  const f: Record<string, unknown> = { kinds: [1], '#t': [T_POST], limit: opts.limit || 50 };
  if (opts.author) f.authors = [opts.author];
  if (opts.since) f.since = opts.since;
  const evs = await nquery(f as never, RELAYS, 7000);
  const list = evs.filter(e => !isTomb(e.id)).map(parsePost);
  await fillCounts(list);
  return list;
}
export async function publishPost(text: string, image_url?: string | null): Promise<Post | null> {
  const s = loadSession();
  if (!s) return null;
  const tagsArr = [['t', T_POST]];
  let content = text;
  if (image_url) { tagsArr.push(['image', image_url]); content = text ? text + '\n' + image_url : image_url; }
  const { event, ok } = await npublish({ kind: 1, content, tags: tagsArr }, s.sk);
  if (!ok) return null;
  const p = { ...parsePost(event), author_id: s.id };
  emitLocalPost(p);
  return p;
}
export async function deletePost(id: string): Promise<void> {
  const s = loadSession();
  if (s) await npublish({ kind: 5, content: 'del', tags: [['e', id]] }, s.sk).catch(() => {});
  addTomb(id);
}
export async function setLike(postId: string, authorPub: string, on: boolean): Promise<void> {
  const s = loadSession();
  if (!s) return;
  if (on) {
    await npublish({ kind: 7, content: '+', tags: [['e', postId], ['p', authorPub], ['t', T_POST]] }, s.sk);
  } else {
    const mine = await nquery({ kinds: [7], authors: [s.id], '#e': [postId], limit: 5 }, READ_RELAYS, 5000);
    if (mine[0]) await npublish({ kind: 5, content: 'unlike', tags: [['e', mine[0].id]] }, s.sk);
  }
}
export async function publishRepost(postId: string, authorPub: string): Promise<void> {
  const s = loadSession();
  if (!s) return;
  const t = [['e', postId]];
  if (authorPub) t.push(['p', authorPub]);
  t.push(['t', T_POST]);
  await npublish({ kind: 6, content: '', tags: t }, s.sk);
}
export async function getComments(postId: string): Promise<Comment[]> {
  const evs = await nquery({ kinds: [1], '#e': [postId], limit: 200 }, RELAYS, 6000);
  return evs
    .filter(e => !isTomb(e.id) && e.tags.some(t => t[0] === 'e' && t[1] === postId))
    .map(e => ({ id: e.id, post_id: postId, author_id: e.pubkey, text: e.content, created_at: iso(e.created_at) }))
    .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
}
export async function publishComment(postId: string, authorPub: string, text: string): Promise<Comment | null> {
  const s = loadSession();
  if (!s) return null;
  const { event, ok } = await npublish(
    { kind: 1, content: text, tags: [['e', postId, '', 'root'], ['p', authorPub], ['t', T_POST]] }, s.sk,
  );
  if (!ok) return null;
  return { id: event.id, post_id: postId, author_id: s.id, text, created_at: iso(event.created_at) };
}

// ---------- follows (kind 3) / mutes (kind 10000) ----------
export async function getFollowing(pub: string): Promise<string[]> {
  const evs = await nquery({ kinds: [3], authors: [pub], limit: 1 }, READ_RELAYS, 4500);
  if (!evs[0]) return [];
  return [...new Set(tags(evs[0], 'p'))];
}
export async function setFollow(followee: string, on: boolean): Promise<void> {
  const s = loadSession();
  if (!s || followee === s.id) return;
  const cur = await getFollowing(s.id);
  const next = on ? [...new Set([...cur, followee])] : cur.filter(x => x !== followee);
  await npublish({ kind: 3, content: '', tags: next.map(p => ['p', p]) }, s.sk);
}
export async function followersOf(pub: string): Promise<string[]> {
  const evs = await nquery({ kinds: [3], '#p': [pub], limit: 500 }, RELAYS, 6000);
  return [...new Set(evs.map(e => e.pubkey))];
}
export async function blockUser(pub: string): Promise<void> {
  const s = loadSession();
  if (!s) return;
  const evs = await nquery({ kinds: [10000], authors: [s.id], limit: 1 }, READ_RELAYS, 4000);
  const cur = evs[0] ? tags(evs[0], 'p') : [];
  if (cur.includes(pub)) return;
  await npublish({ kind: 10000, content: '', tags: [...cur.map(p => ['p', p]), ['p', pub]] }, s.sk);
}
export async function mutedList(): Promise<string[]> {
  const s = loadSession();
  if (!s) return [];
  const evs = await nquery({ kinds: [3, 10000], authors: [s.id], limit: 2 }, READ_RELAYS, 4000);
  const m = evs.find(e => e.kind === 10000);
  return m ? tags(m, 'p') : [];
}

// ---------- stories (kind 1 + #legion-story, 24h client-side) ----------
export async function getStories(): Promise<Story[]> {
  const evs = await nquery({ kinds: [1], '#t': [T_STORY], limit: 60 }, RELAYS, 6000);
  const cutoff = Date.now() - 24 * 3600e3;
  return evs
    .filter(e => !isTomb(e.id) && e.created_at * 1000 > cutoff)
    .map(e => ({
      id: e.id, author_id: e.pubkey, image_url: tag(e, 'image') || null, text: e.content,
      created_at: iso(e.created_at), expires_at: new Date(e.created_at * 1000 + 24 * 3600e3).toISOString(),
    }));
}
export async function publishStory(text: string): Promise<Story | null> {
  const s = loadSession();
  if (!s) return null;
  const { event, ok } = await npublish({ kind: 1, content: text, tags: [['t', T_STORY]] }, s.sk);
  if (!ok) return null;
  return {
    id: event.id, author_id: s.id, image_url: null, text,
    created_at: iso(event.created_at), expires_at: new Date(event.created_at * 1000 + 24 * 3600e3).toISOString(),
  };
}

// ---------- reports (NIP-56 kind 1984) ----------
export async function publishReport(target_kind: string, target_id: string, reason: string): Promise<boolean> {
  const s = loadSession();
  if (!s) return false;
  const t: string[][] = [['legion-kind', target_kind]];
  if (/^[0-9a-f]{64}$/i.test(target_id)) t.push(['e', target_id]);
  else t.push(['legion-target', target_id]);
  const { ok } = await npublish({ kind: 1984, content: reason.slice(0, 500), tags: t }, s.sk);
  return ok;
}
const RESOLVED_K = 'legion-reports-resolved-v1';
function resolved(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(RESOLVED_K) || '[]')); } catch { return new Set(); }
}
export function resolveReportLocal(id: string, status: string) {
  try {
    const r = resolved();
    if (status !== 'open') r.add(id); else r.delete(id);
    localStorage.setItem(RESOLVED_K, JSON.stringify([...r].slice(-2000)));
  } catch {}
}
export async function getReports(): Promise<Report[]> {
  const evs = await nquery({ kinds: [1984], limit: 200 }, RELAYS, 6000);
  const res = resolved();
  return evs.map(e => ({
    id: e.id, reporter_id: e.pubkey,
    target_kind: tag(e, 'legion-kind') || 'post',
    target_id: tag(e, 'e') || tag(e, 'legion-target') || '',
    reason: e.content, status: (res.has(e.id) ? 'done' : 'open') as Report['status'],
    created_at: iso(e.created_at),
  }));
}

// ---------- announcements (kind 1 + #legion-announce) ----------
export async function publishAnnouncement(title: string, body: string): Promise<boolean> {
  const s = loadSession();
  if (!s) return false;
  const { ok } = await npublish({ kind: 1, content: `${title}\n${body}`.slice(0, 2000), tags: [['t', T_ANN]] }, s.sk);
  return ok;
}
export async function getAnnouncements(): Promise<{ id: string; title: string; body: string; created_at: string }[]> {
  const evs = await nquery({ kinds: [1], '#t': [T_ANN], limit: 20 }, RELAYS, 6000);
  return evs.map(e => {
    const [title, ...rest] = e.content.split('\n');
    return { id: e.id, title, body: rest.join('\n'), created_at: iso(e.created_at) };
  });
}

// ---------- AI bots directory (kind 30078 + local) ----------
export interface BotRow { id: string; owner_id: string; name: string; avatar_url: string | null; persona: string; system: string; is_public: boolean; uses: number; created_at: string }
const BOTS_K = 'legion-bots-v1';
function localBots(): BotRow[] {
  try { return JSON.parse(localStorage.getItem(BOTS_K) || '[]'); } catch { return []; }
}
function saveLocalBots(b: BotRow[]) { try { localStorage.setItem(BOTS_K, JSON.stringify(b.slice(0, 100))); } catch {} }
export async function listBots(): Promise<BotRow[]> {
  const map = new Map<string, BotRow>();
  localBots().forEach(b => map.set(b.id, b));
  try {
    const evs = await nquery({ kinds: [30078], '#t': [T_BOT], limit: 100 }, RELAYS, 6000);
    for (const e of evs) {
      const d = tag(e, 'd');
      if (!d || map.has(d)) continue;
      try {
        const j = JSON.parse(e.content);
        if (j.name) map.set(d, { id: d, owner_id: e.pubkey, name: j.name, avatar_url: j.avatar_url || null, persona: j.persona || '', system: j.system || '', is_public: true, uses: j.uses || 0, created_at: iso(e.created_at) });
      } catch {}
    }
  } catch {}
  return [...map.values()];
}
export async function createBot(b: { name: string; persona: string; system: string }): Promise<BotRow | null> {
  const s = loadSession();
  if (!s) return null;
  const id = 'bot-' + s.id.slice(0, 8) + '-' + Date.now().toString(36);
  const row: BotRow = { id, owner_id: s.id, name: b.name, avatar_url: null, persona: b.persona, system: b.system, is_public: true, uses: 0, created_at: new Date().toISOString() };
  const all = localBots();
  all.unshift(row);
  saveLocalBots(all);
  await npublish({ kind: 30078, content: JSON.stringify(row), tags: [['d', id], ['t', T_BOT]] }, s.sk).catch(() => {});
  return row;
}
export async function bumpBotUses(id: string): Promise<void> {
  const all = localBots();
  const b = all.find(x => x.id === id);
  if (b) { b.uses++; saveLocalBots(all); }
}

// ---------- realtime ----------
type PostCb = (p: Post) => void;
const postBus = new Set<PostCb>();
export function onLocalPost(cb: PostCb): () => void {
  postBus.add(cb);
  return () => { postBus.delete(cb); };
}
function emitLocalPost(p: Post) { postBus.forEach(f => { try { f(p); } catch {} }); }
export function subPosts(cb: (p: Post) => void): () => void {
  const off = onLocalPost(cb);
  const unsub = nsub(RELAYS, { kinds: [1], '#t': [T_POST], since: ts() }, e => {
    if (!isTomb(e.id)) cb(parsePost(e));
  });
  return () => { off(); unsub(); };
}
export function subReacts(cb: () => void): () => void {
  return nsub(RELAYS, { kinds: [7], since: ts(), limit: 0 }, () => cb());
}
