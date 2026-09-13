// LEGION social graph on Nostr: kind-0 profiles, kind-1 posts/comments,
// kind-6 reposts, kind-7 likes, kind-3 follows, kind-10000 mutes, kind-1984 reports.
import { nip19, type Event as NEvent } from 'nostr-tools';
import { nquery, npublish, nsub, tag, tags, ts, iso } from './nostr';
import { T_POST, T_STORY, T_ANN, T_BOT, T_EVENT, READ_RELAYS, RELAYS, ADMIN_EMAILS } from './config';
import { loadSession } from './identity';
import { loadBanlist } from './banlist';
import type { Profile, Post, Comment, Story, Report } from '../supabase/types';

// ---------- tombstones (local deletes) ----------
const TOMB_K = 'legion-tomb-v1';
function tombs(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(TOMB_K) || '[]')); } catch { return new Set(); }
}
export function isTomb(id: string): boolean { return tombs().has(id); }
export function addTomb(id: string) {
  try {
    const t = tombs(); t.add(id);
    localStorage.setItem(TOMB_K, JSON.stringify([...t].slice(-2000)));
  } catch {}
}

// ---------- profiles (kind 0) ----------
interface K0 { name?: string; about?: string; picture?: string; banner?: string; legion_status?: string; legion_private?: boolean; lud16?: string; lud06?: string }
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
      (p as unknown as Record<string, unknown>).lud16 = j.lud16 || j.lud06 || null;
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
    else if (me && me.id === pub && me.email && ADMIN_EMAILS.includes(me.email.toLowerCase()) && bl.admins.length === 0) p.role = 'admin';
    if (bl.verified.includes(pub)) p.verified = true;
    if (bl.banned.includes(pub)) p.status = '⛔ banned';
  } catch {}
  return p;
}
export async function listProfiles(limit = 100): Promise<Profile[]> {
  const out = new Map<string, Profile>();
  // LEGION authors first (real network people), broad relay fill after
  try {
    const leg = await directory(Math.min(80, limit));
    leg.forEach(p => out.set(p.id, p));
  } catch {}
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

// ---------- directory: real LEGION people (post authors + kind-0s) ----------
export async function directory(limit = 60): Promise<Profile[]> {
  const out = new Map<string, Profile>();
  let authors: string[] = [];
  try {
    const posts = await getPosts({ limit: 80 });
    authors = [...new Set(posts.map(p => p.author_id))].slice(0, 60);
  } catch {}
  try {
    const f: Record<string, unknown> = { kinds: [0], limit: 150 };
    if (authors.length) f.authors = authors;
    const evs = await nquery(f as never, READ_RELAYS, 6000);
    const latest = new Map<string, NEvent>();
    [...evs].reverse().forEach(e => latest.set(e.pubkey, e));
    latest.forEach((e, pub) => {
      let j: K0 = {};
      try { j = JSON.parse(e.content); } catch {}
      if (!j.name && !j.picture) return;
      out.set(pub, {
        ...blankProfile(pub), name: j.name || blankProfile(pub).name,
        bio: j.about || '', avatar_url: j.picture || null, cover_url: j.banner || null,
        status: j.legion_status || '', is_private: !!j.legion_private,
        created_at: iso(e.created_at), last_seen: iso(e.created_at),
      } as Profile);
    });
    authors.forEach(a => { if (!out.has(a)) out.set(a, blankProfile(a)); });
  } catch {
    authors.forEach(a => { if (!out.has(a)) out.set(a, blankProfile(a)); });
  }
  const me = loadSession();
  if (me && !out.has(me.id)) out.set(me.id, await getProfile(me.id));
  try {
    const bl = await loadBanlist();
    out.forEach(pr => {
      if (bl.roles[pr.id]) pr.role = bl.roles[pr.id] as Profile['role'];
      if (bl.admins.includes(pr.id)) pr.role = 'admin';
      if (bl.verified.includes(pr.id)) pr.verified = true;
    });
  } catch {}
  return [...out.values()].slice(0, limit);
}
export async function searchProfiles(q: string): Promise<Profile[]> {
  const query = q.trim().replace(/^@/, '');
  if (query.length < 2) return [];
  try {
    const evs = await nquery({ kinds: [0], search: query, limit: 20 } as never, RELAYS, 6000);
    const out: Profile[] = [];
    for (const e of evs) {
      let j: K0 = {};
      try { j = JSON.parse(e.content); } catch {}
      if (!j.name && !j.picture) continue;
      out.push({
        ...blankProfile(e.pubkey), name: j.name || blankProfile(e.pubkey).name,
        bio: j.about || '', avatar_url: j.picture || null,
        created_at: iso(e.created_at), last_seen: iso(e.created_at),
      });
      if (out.length >= 20) break;
    }
    return out;
  } catch { return []; }
}
// npub / hex / nip05 (name@domain) -> pubkey
export async function resolveAccount(input: string): Promise<string | null> {
  const v = input.trim();
  if (/^[0-9a-f]{64}$/i.test(v)) return v.toLowerCase();
  if (v.startsWith('npub1')) {
    try {
      const d = nip19.decode(v);
      if (d.type === 'npub') return d.data as string;
    } catch {}
    return null;
  }
  const m = v.match(/^([^@\s]+)@([^@\s]+\.[^@\s]+)$/);
  if (m) {
    try {
      const r = await fetch(`https://${m[2]}/.well-known/nostr.json?name=${encodeURIComponent(m[1])}`);
      const j = await r.json();
      const pk = j?.names?.[m[1].toLowerCase()];
      return typeof pk === 'string' && /^[0-9a-f]{64}$/i.test(pk) ? pk.toLowerCase() : null;
    } catch { return null; }
  }
  return null;
}

// ---------- posts (kind 1 + #legion) ----------
const IMG_URL = /(https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?)\s*$/i;
export function parsePost(e: NEvent): Post {
  let text = e.content;
  let image: string | null = tag(e, 'image') || null;
  const video: string | null = tag(e, 'video') || null;
  const m = text.match(IMG_URL);
  if (!image && m) image = m[1];
  if (m) text = text.slice(0, m.index).trim();
  return {
    id: e.id, author_id: e.pubkey, text, image_url: image, video_url: video,
    kindTag: tag(e, 'legion-kind') || null,
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
  let hidden: Set<string> = new Set();
  let banned: Set<string> = new Set();
  try {
    const bl = await loadBanlist();
    hidden = new Set(bl.hidden || []);
    banned = new Set(bl.banned || []);
  } catch {}
  let list = evs.filter(e => !isTomb(e.id) && !hidden.has(e.id) && !banned.has(e.pubkey)).map(parsePost);
  // private profiles: visible to self + followers only
  const mePub = loadSession()?.id;
  const authors = [...new Set(list.map(p => p.author_id))];
  if (authors.length) {
    try {
      const kev = await nquery({ kinds: [0], authors: authors.slice(0, 80) }, READ_RELAYS, 5000);
      const priv = new Set<string>();
      kev.forEach(e => { try { if ((JSON.parse(e.content) as K0).legion_private) priv.add(e.pubkey); } catch {} });
      if (priv.size) {
        let following: Set<string> = new Set();
        if (mePub) { try { following = new Set(await getFollowing(mePub)); } catch {} }
        list = list.filter(p => !priv.has(p.author_id) || p.author_id === mePub || following.has(p.author_id));
      }
    } catch {}
  }
  await fillCounts(list);
  return mergeLocal(list, p => !opts.author || p.author_id === opts.author);
}
export function extractTags(text: string): string[] {
  try {
    const m = text.match(/#[\p{L}\p{N}_]{2,30}/gu) || [];
    return [...new Set(m.map(t => t.slice(1).toLowerCase()))].slice(0, 8);
  } catch { return []; }
}
export async function publishPost(text: string, image_url?: string | null, video_url?: string | null, extraTags?: string[][]): Promise<Post | null> {
  const s = loadSession();
  if (!s) return null;
  const tagsArr: string[][] = [['t', T_POST]];
  extractTags(text).forEach(t => tagsArr.push(['t', t]));
  (extraTags || []).forEach(t => tagsArr.push(t));
  let content = text;
  if (image_url) { tagsArr.push(['image', image_url]); content = text ? text + '\n' + image_url : image_url; }
  if (video_url) { tagsArr.push(['video', video_url]); content = text ? text + '\n' + video_url : video_url; }
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
  forgetLocalPost(id);
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
  let hidden: Set<string> = new Set();
  try { hidden = new Set((await loadBanlist()).hidden || []); } catch {}
  const list = evs
    .filter(e => !isTomb(e.id) && !hidden.has(e.id) && e.tags.some(t => t[0] === 'e' && t[1] === postId))
    .map(e => ({ id: e.id, post_id: postId, author_id: e.pubkey, text: e.content, created_at: iso(e.created_at) }))
    .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  return mergeLocal(list, p => p.post_id === postId);
}
export async function getPostsByTag(raw: string): Promise<Post[]> {
  const t = raw.replace(/^#/, '').toLowerCase().slice(0, 30);
  if (!t) return [];
  const evs = await nquery({ kinds: [1], '#t': [t], limit: 60 }, RELAYS, 7000);
  let hidden: Set<string> = new Set();
  let banned: Set<string> = new Set();
  try {
    const bl = await loadBanlist();
    hidden = new Set(bl.hidden || []);
    banned = new Set(bl.banned || []);
  } catch {}
  const list = evs.filter(e => !isTomb(e.id) && !hidden.has(e.id) && !banned.has(e.pubkey)).map(parsePost);
  await fillCounts(list);
  return mergeLocal(list, p => Array.isArray(p._tags) && (p._tags as string[]).includes(t));
}
export async function publishComment(postId: string, authorPub: string, text: string): Promise<Comment | null> {
  const s = loadSession();
  if (!s) return null;
  const { event, ok } = await npublish(
    { kind: 1, content: text, tags: [['e', postId, '', 'root'], ['p', authorPub], ['t', T_POST]] }, s.sk,
  );
  if (!ok) return null;
  const c = { id: event.id, post_id: postId, author_id: s.id, text, created_at: iso(event.created_at) };
  rememberLocalPost(c);
  return c;
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
  let hidden: Set<string> = new Set();
  try { hidden = new Set((await loadBanlist()).hidden || []); } catch {}
  const list = evs
    .filter(e => !isTomb(e.id) && !hidden.has(e.id) && e.created_at * 1000 > cutoff)
    .map(e => ({
      id: e.id, author_id: e.pubkey, image_url: tag(e, 'image') || null, text: e.content,
      created_at: iso(e.created_at), expires_at: new Date(e.created_at * 1000 + 24 * 3600e3).toISOString(),
    }));
  return mergeLocal(list);
}
export async function publishStory(text: string, image_url?: string | null): Promise<Story | null> {
  const s = loadSession();
  if (!s) return null;
  const tg: string[][] = [['t', T_STORY]];
  if (image_url) tg.push(['image', image_url]);
  const { event, ok } = await npublish({ kind: 1, content: text, tags: tg }, s.sk);
  if (!ok) return null;
  const st = {
    id: event.id, author_id: s.id, image_url: image_url || null, text,
    created_at: iso(event.created_at), expires_at: new Date(event.created_at * 1000 + 24 * 3600e3).toISOString(),
  };
  rememberLocalPost(st);
  return st;
}
export async function unblockUser(pub: string): Promise<void> {
  const s = loadSession();
  if (!s) return;
  const evs = await nquery({ kinds: [10000], authors: [s.id], limit: 1 }, READ_RELAYS, 4000);
  const cur = evs[0] ? tags(evs[0], 'p') : [];
  if (!cur.includes(pub)) return;
  await npublish({ kind: 10000, content: '', tags: cur.filter(x => x !== pub).map(p => ['p', p]) }, s.sk);
}
// ---------- events (kind 1 + #legion-event, RSVP = kind-7 legion-rsvp) ----------
export interface LegionEvent { id: string; author_id: string; title: string; at: string; place: string; about: string; going: number; meGoing: boolean; created_at: string }
export async function publishEvent(e: { title: string; at: string; place: string; about: string }): Promise<LegionEvent | null> {
  const s = loadSession();
  if (!s) return null;
  const { event, ok } = await npublish({ kind: 1, content: JSON.stringify(e), tags: [['t', T_EVENT]] }, s.sk);
  if (!ok) return null;
  return { id: event.id, author_id: s.id, ...e, going: 0, meGoing: false, created_at: iso(event.created_at) };
}
export async function listEvents(): Promise<LegionEvent[]> {
  const me = loadSession()?.id;
  const evs = await nquery({ kinds: [1], '#t': [T_EVENT], limit: 100 }, RELAYS, 6000);
  let hidden: Set<string> = new Set();
  try { hidden = new Set((await loadBanlist()).hidden || []); } catch {}
  const out: LegionEvent[] = [];
  for (const e of evs) {
    if (isTomb(e.id) || hidden.has(e.id)) continue;
    try {
      const j = JSON.parse(e.content);
      if (!j.title) continue;
      out.push({ id: e.id, author_id: e.pubkey, title: String(j.title).slice(0, 120), at: String(j.at || ''), place: String(j.place || ''), about: String(j.about || '').slice(0, 500), going: 0, meGoing: false, created_at: iso(e.created_at) });
    } catch {}
  }
  if (out.length) {
    try {
      const votes = await nquery({ kinds: [7], '#e': out.map(o => o.id).slice(0, 40), limit: 500 }, READ_RELAYS, 5000);
      const seen = new Map<string, Set<string>>();
      votes.forEach(v => {
        if (v.content !== 'legion-rsvp') return;
        const ref = tag(v, 'e');
        if (!ref) return;
        if (!seen.has(ref)) seen.set(ref, new Set());
        seen.get(ref)!.add(v.pubkey);
      });
      out.forEach(o => {
        const st = seen.get(o.id);
        o.going = st ? st.size : 0;
        o.meGoing = me ? !!st?.has(me) : false;
      });
    } catch {}
  }
  return out;
}
export async function rsvpEvent(id: string): Promise<void> {
  const s = loadSession();
  if (!s) return;
  const mine = await nquery({ kinds: [7], authors: [s.id], '#e': [id], limit: 5 }, READ_RELAYS, 4000);
  if (mine.some(e => e.content === 'legion-rsvp')) return;
  await npublish({ kind: 7, content: 'legion-rsvp', tags: [['e', id]] }, s.sk);
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
// locally-published posts cache: merged into query results so own posts never
// vanish while relays propagate (dropped once relay copy arrives or after 30 min)
const LOCAL_K = 'legion-local-posts-v1';
interface LocalMem { id: string; author_id: string; created_at: string; [k: string]: unknown }
function readLocal(): LocalMem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_K) || '[]') as LocalMem[];
    return Array.isArray(raw) ? raw.filter(x => x && x.id) : [];
  } catch { return []; }
}
function rememberLocalPost(p: { id: string; author_id: string; created_at: string; text?: string; post_id?: string }) {
  try {
    const mem: LocalMem = { ...(p as unknown as LocalMem), _tags: extractTags(p.text || '') };
    const all = [mem, ...readLocal().filter(x => x.id !== p.id)].slice(0, 40);
    localStorage.setItem(LOCAL_K, JSON.stringify(all));
  } catch {}
}
function mergeLocal<T extends { id: string; author_id: string; created_at: string }>(list: T[], keep?: (p: LocalMem) => boolean): T[] {
  const ids = new Set(list.map(p => p.id));
  const now = Date.now();
  const fresh = readLocal().filter(p => !ids.has(p.id) && now - +new Date(p.created_at) < 30 * 60e3 && (!keep || keep(p))) as unknown as T[];
  return [...fresh, ...list];
}
function forgetLocalPost(id: string) {
  try { localStorage.setItem(LOCAL_K, JSON.stringify(readLocal().filter(x => x.id !== id))); } catch {}
}
function emitLocalPost(p: Post) { rememberLocalPost(p); postBus.forEach(f => { try { f(p); } catch {} }); }
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
