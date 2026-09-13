'use client';
// Hybrid-backed client with a Supabase-shaped API.
// All existing UI keeps working — data flows over Nostr/Trystero/P2P instead.
import * as ID from '../hybrid/identity';
import {
  getProfile, listProfiles, saveProfile, getPosts, publishPost, deletePost, setLike,
  publishRepost, getComments, publishComment, getFollowing, setFollow, followersOf,
  blockUser, getStories, publishStory, publishReport, getReports, resolveReportLocal,
  publishAnnouncement, getAnnouncements, listBots, createBot, bumpBotUses,
  subPosts, subReacts,
} from '../hybrid/social';
import {
  listConvos, getConvo, ensureDm, createGroup, convoToRow, membershipRows, touchConvo,
  sendDm, readDm, sendGroup, readGroup, subConvo, listConvoMessages, msgById,
  listReacts, setReact, togglePin, addMember, createPendingDm, setDmPeer,
} from '../hybrid/dm';
import { pushNotif, listNotifs, markAllRead, insertCompat, onPush, startNotifyEngine } from '../hybrid/notify';
import { uploadFile, rememberUrl, lookupUrl } from '../hybrid/storage';
import { applyMod, loadBanlist } from '../hybrid/banlist';
import { announce, onOnline, presenceSnapshot, sendTyping, onTyping, sendSignal, onSignal } from '../hybrid/live';
import { ADMIN_EMAILS } from '../hybrid/config';

export function isCloud(): boolean { return true; } // hybrid rails are always on

type Row = Record<string, any>;
interface Filter { c: string; op: string; v: any }
const ok = (data: any, count?: number) => ({ data, error: null as any, count });

// ---------- local tables (device-private) ----------
function lsGet<T>(k: string): T[] {
  try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; }
}
function lsSet(k: string, v: unknown[]) {
  try { localStorage.setItem(k, JSON.stringify(v.slice(0, 500))); } catch {}
}
const ACT_K = 'legion-activity-v1';
const MEM_K = 'legion-aimem-v1';

// ---------- filter/order helpers ----------
function applyFilters(rows: Row[], fs: Filter[]): Row[] {
  if (!fs.length) return rows;
  return rows.filter(r => fs.every(f => {
    const v = r[f.c];
    if (f.op === 'eq') return v === f.v;
    if (f.op === 'neq') return v !== f.v;
    if (f.op === 'in') return Array.isArray(f.v) && f.v.includes(v);
    if (f.op === 'gt') return v != null && f.v != null && v > f.v;
    if (f.op === 'gte') return v != null && f.v != null && v >= f.v;
    if (f.op === 'lt') return v != null && f.v != null && v < f.v;
    return true;
  }));
}
function applyOrder(rows: Row[], orders: { c: string; asc: boolean }[]): Row[] {
  orders.forEach(o => rows.sort((a, b) => {
    const x = a[o.c], y = b[o.c];
    if (x === y) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x < y ? -1 : 1) * (o.asc ? 1 : -1);
  }));
  return rows;
}

// ---------- FK embeds: alias:table!fk(cols) ----------
const EMB_RE = /(\w+):(\w+)(?:![A-Za-z0-9_]+)?\(([^)]*)\)/g;
const FK_COL: Record<string, string> = { author: 'author_id', sender: 'sender_id', user: 'user_id', owner: 'owner_id', convo: 'convo_id' };
async function applyEmbeds(rows: Row[], sel: string): Promise<Row[]> {
  const matches = [...sel.matchAll(EMB_RE)];
  if (!matches.length) return rows;
  for (const m of matches) {
    const [, alias, table, colsRaw] = m;
    const fk = FK_COL[alias];
    if (!fk) continue;
    const cols = colsRaw.trim() === '*' ? null : colsRaw.split(',').map(s => s.trim()).filter(Boolean);
    await Promise.all(rows.map(async r => {
      try {
        let rel: Row | null = null;
        if (table === 'profiles' && r[fk]) rel = (await getProfile(String(r[fk]))) as unknown as Row;
        else if (table === 'conversations' && r[fk]) {
          const c = getConvo(String(r[fk]));
          rel = (c ? convoToRow(c) : null) as unknown as Row;
        }
        if (rel && cols) {
          const proj: Row = {};
          cols.forEach(c => { proj[c] = rel![c]; });
          rel = proj;
        }
        r[alias] = rel;
      } catch { r[alias] = null; }
    }));
  }
  return rows;
}

// ---------- per-convo message cache (for counts/histograms) ----------
const msgListCache = new Map<string, { at: number; msgs: Row[] }>();
async function cachedConvoMsgs(id: string): Promise<Row[]> {
  const c = msgListCache.get(id);
  if (c && Date.now() - c.at < 60e3) return c.msgs;
  const msgs = (await listConvoMessages(id)) as unknown as Row[];
  msgListCache.set(id, { at: Date.now(), msgs });
  return msgs;
}

// ---------- query builder ----------
type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert';
class QB {
  private table: string;
  private op: Op = 'select';
  private sel = '*';
  private retSel: string | null = null;
  private filters: Filter[] = [];
  private orders: { c: string; asc: boolean }[] = [];
  private lim: number | null = null;
  private singleRow = false;
  private countOpt: { count?: string; head?: boolean } | null = null;
  private payload: any = null;
  constructor(table: string) { this.table = table; }
  select(cols = '*', opts?: { count?: string; head?: boolean }): this {
    if (this.op === 'insert' || this.op === 'upsert') this.retSel = cols;
    else { this.op = 'select'; this.sel = cols; }
    if (opts) this.countOpt = opts;
    return this;
  }
  insert(rows: any): this { this.op = 'insert'; this.payload = rows; return this; }
  update(patch: any): this { this.op = 'update'; this.payload = patch; return this; }
  delete(): this { this.op = 'delete'; return this; }
  upsert(row: any, _o?: { onConflict?: string }): this { this.op = 'upsert'; this.payload = row; return this; }
  eq(c: string, v: any): this { this.filters.push({ c, op: 'eq', v }); return this; }
  neq(c: string, v: any): this { this.filters.push({ c, op: 'neq', v }); return this; }
  in(c: string, v: any[]): this { this.filters.push({ c, op: 'in', v }); return this; }
  gt(c: string, v: any): this { this.filters.push({ c, op: 'gt', v }); return this; }
  gte(c: string, v: any): this { this.filters.push({ c, op: 'gte', v }); return this; }
  lt(c: string, v: any): this { this.filters.push({ c, op: 'lt', v }); return this; }
  order(c: string, o?: { ascending?: boolean }): this { this.orders.push({ c, asc: o?.ascending !== false }); return this; }
  limit(n: number): this { this.lim = n; return this; }
  single(): this { this.singleRow = true; return this; }
  then(res?: (v: any) => any, rej?: (e: any) => any): Promise<any> { return this.exec().then(res, rej); }
  catch(rej: (e: any) => any): Promise<any> { return this.exec().catch(rej); }

  private fval(c: string, op = 'eq'): any {
    return this.filters.find(f => f.c === c && f.op === op)?.v;
  }
  private async exec(): Promise<any> {
    try {
      if (this.op === 'select') return await this.doSelect();
      if (this.op === 'insert' || this.op === 'upsert') return await this.doInsert();
      if (this.op === 'update') return await this.doUpdate();
      return await this.doDelete();
    } catch (e) {
      return { data: null, error: { message: String(e).slice(0, 300) } };
    }
  }

  private async fetchRows(): Promise<Row[]> {
    const t = this.table;
    const me = ID.loadSession();
    if (t === 'profiles') {
      const id = this.fval('id');
      if (id) { try { return [(await getProfile(String(id))) as unknown as Row]; } catch { return []; } }
      return (await listProfiles(100)) as unknown as Row[];
    }
    if (t === 'posts') {
      const a = this.fval('author_id');
      return (await getPosts({ author: a ? String(a) : undefined, limit: this.lim || 60 })) as unknown as Row[];
    }
    if (t === 'comments') {
      const p = this.fval('post_id');
      if (!p) return [];
      return (await getComments(String(p))) as unknown as Row[];
    }
    if (t === 'likes' || t === 'reposts' || t === 'blocks') return [];
    if (t === 'follows') {
      const er = this.fval('follower_id'), ee = this.fval('followee_id');
      if (er && ee) {
        const list = await getFollowing(String(er));
        return list.includes(String(ee)) ? [{ follower_id: er, followee_id: ee, created_at: '' }] : [];
      }
      if (er) return (await getFollowing(String(er))).map(x => ({ follower_id: er, followee_id: x, created_at: '' }));
      if (ee) return (await followersOf(String(ee))).map(x => ({ follower_id: x, followee_id: ee, created_at: '' }));
      return [];
    }
    if (t === 'stories') return (await getStories()) as unknown as Row[];
    if (t === 'notifications') return (me ? listNotifs(me.id) : []) as unknown as Row[];
    if (t === 'conversations') return listConvos().map(c => convoToRow(c) as unknown as Row);
    if (t === 'convo_members') return membershipRows() as unknown as Row[];
    if (t === 'messages') {
      const cid = this.fval('convo_id');
      const id = this.fval('id');
      if (id) {
        const m = await msgById(String(id));
        return (m ? [m] : []) as unknown as Row[];
      }
      if (cid) return (await cachedConvoMsgs(String(cid))) as Row[];
      // admin/stats overview: gather own convos
      const all: Row[] = [];
      for (const c of listConvos().slice(0, 30)) {
        try { all.push(...(await cachedConvoMsgs(c.id))); } catch {}
      }
      return all;
    }
    if (t === 'reactions') {
      const ids = this.filters.find(f => f.c === 'message_id' && f.op === 'in')?.v as string[] | undefined;
      if (!ids?.length) return [];
      return (await listReacts(ids)) as unknown as Row[];
    }
    if (t === 'bots') return (await listBots()) as unknown as Row[];
    if (t === 'reports') return (await getReports()) as unknown as Row[];
    if (t === 'activity_log') return lsGet<Row>(ACT_K);
    if (t === 'announcements') return (await getAnnouncements()) as unknown as Row[];
    if (t === 'ai_memories') return lsGet<Row>(MEM_K);
    return [];
  }

  private async doSelect(): Promise<any> {
    let rows = applyFilters(await this.fetchRows(), this.filters);
    rows = applyOrder(rows, this.orders);
    const total = rows.length;
    if (this.lim != null) rows = rows.slice(0, this.lim);
    await applyEmbeds(rows, this.sel);
    if (this.countOpt?.count === 'exact') return ok(this.countOpt.head ? [] : rows, total);
    if (this.singleRow) return ok(rows[0] ?? null);
    return ok(rows);
  }

  private async doInsert(): Promise<any> {
    const t = this.table;
    const me = ID.loadSession();
    const arr = Array.isArray(this.payload) ? this.payload : [this.payload];
    const out: Row[] = [];
    for (const r of arr) {
      try {
        if (t === 'profiles' && me) {
          const p = await saveProfile({ name: r.name, bio: r.bio, status: r.status, avatar_url: r.avatar_url, cover_url: r.cover_url, is_private: r.is_private });
          if (p) out.push(p as unknown as Row);
        } else if (t === 'posts' && me) {
          const p = await publishPost(r.text, r.image_url);
          if (p) out.push({ ...(p as unknown as Row) });
        } else if (t === 'comments' && me) {
          const c = await publishComment(r.post_id, '', r.text);
          if (c) out.push(c as unknown as Row);
        } else if (t === 'likes' && me) {
          await setLike(r.post_id, '', true);
          out.push({ post_id: r.post_id, user_id: me.id });
        } else if (t === 'reposts' && me) {
          await publishRepost(r.post_id, '');
          out.push({ post_id: r.post_id, user_id: me.id });
        } else if (t === 'follows' && me) {
          await setFollow(r.followee_id, true);
          out.push({ follower_id: me.id, followee_id: r.followee_id });
        } else if (t === 'blocks' && me) {
          await blockUser(r.blocked_id);
          out.push({ user_id: me.id, blocked_id: r.blocked_id });
        } else if (t === 'stories' && me) {
          const s = await publishStory(r.text);
          if (s) out.push(s as unknown as Row);
        } else if (t === 'notifications') {
          // handled in bulk below
        } else if (t === 'conversations' && me) {
          if (r.kind === 'dm') {
            const c = createPendingDm();
            out.push(convoToRow(c) as unknown as Row);
          } else {
            const c = createGroup(r.kind === 'channel' ? 'channel' : 'group', r.title || 'Группа');
            if (c) out.push(convoToRow(c) as unknown as Row);
          }
        } else if (t === 'convo_members' && me) {
          const c = getConvo(r.convo_id);
          if (c && c.kind === 'dm' && r.user_id !== me.id) setDmPeer(c.id, r.user_id);
          else if (c && c.kind !== 'dm' && r.user_id !== me.id) await addMember(c.id, r.user_id);
          out.push({ convo_id: r.convo_id, user_id: r.user_id, role: r.role || 'member' });
        } else if (t === 'messages' && me) {
          const m = await this.sendMessage(r);
          if (m) {
            out.push(m as unknown as Row);
            msgListCache.delete(r.convo_id);
          }
        } else if ((t === 'reactions') && me) {
          await setReact(r.message_id, r.emoji, true);
          out.push({ message_id: r.message_id, user_id: me.id, emoji: r.emoji });
        } else if (t === 'bots' && me) {
          const b = await createBot({ name: r.name, persona: r.persona || '', system: r.system || '' });
          if (b) out.push(b as unknown as Row);
        } else if (t === 'reports' && me) {
          await publishReport(r.target_kind, r.target_id, r.reason || '');
          out.push({ id: 'r-' + Date.now().toString(36), ...r, status: 'open', created_at: new Date().toISOString() });
        } else if (t === 'activity_log') {
          const row = { id: 'a-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), created_at: new Date().toISOString(), ...r };
          const all = lsGet<Row>(ACT_K); all.unshift(row); lsSet(ACT_K, all);
          out.push(row);
        } else if (t === 'announcements' && me) {
          await publishAnnouncement(r.title, r.body || '');
          out.push({ title: r.title, body: r.body || '', created_at: new Date().toISOString() });
        } else if (t === 'ai_memories' && me) {
          const row = { id: 'm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), created_at: new Date().toISOString(), ...r };
          const all = lsGet<Row>(MEM_K); all.unshift(row); lsSet(MEM_K, all);
          out.push(row);
        }
      } catch { /* skip failed row */ }
    }
    if (t === 'notifications') {
      await insertCompat(arr).catch(() => {});
      return ok(arr);
    }
    if (this.retSel) await applyEmbeds(out, this.retSel);
    if (this.singleRow) return ok(out[0] ?? null);
    return ok(out);
  }

  private async sendMessage(r: Row): Promise<Row | null> {
    const cid: string = r.convo_id;
    const f = { kind: r.kind || 'text', text: r.text || '', media_url: r.media_url || null, reply_to: r.reply_to || null, disappear_at: r.disappear_at || null };
    if (cid.startsWith('dm:')) {
      let peer = cid.slice(3);
      if (!/^[0-9a-f]{64}$/i.test(peer)) {
        const e = getConvo(cid);
        peer = e?.peer || '';
        if (!peer) return null;
      }
      ensureDm(peer);
      return (await sendDm(peer, f)) as unknown as Row | null;
    }
    const c = getConvo(cid);
    if (!c) return null;
    if (c.nip29) {
      const { sendNip29 } = await import('../hybrid/dm');
      return (await sendNip29(cid, f.text)) as unknown as Row | null;
    }
    return (await sendGroup(cid, f)) as unknown as Row | null;
  }

  private async doUpdate(): Promise<any> {
    const t = this.table;
    const me = ID.loadSession();
    const p = this.payload || {};
    if (t === 'profiles' && me) {
      const id = String(this.fval('id') || me.id);
      if (id === me.id) {
        const patch: Record<string, any> = {};
        if (p.name !== undefined) patch.name = p.name;
        if (p.bio !== undefined) patch.bio = p.bio;
        if (p.status !== undefined) patch.status = p.status;
        if (p.avatar_url !== undefined) patch.avatar_url = p.avatar_url;
        if (p.cover_url !== undefined) patch.cover_url = p.cover_url;
        if (p.is_private !== undefined) patch.is_private = p.is_private;
        if (Object.keys(patch).length) {
          await saveProfile(patch);
          ID.touchSession({ name: patch.name || me.name, avatar: patch.avatar_url !== undefined ? patch.avatar_url : me.avatar });
        }
      } else {
        // admin moderation -> banlist
        if (p.role !== undefined) await applyMod('role', id, p.role);
        if (p.verified !== undefined) await applyMod(p.verified ? 'verify' : 'unverify', id);
        if (p.banned !== undefined) await applyMod(p.banned ? 'ban' : 'unban', id);
      }
    } else if (t === 'convo_members') {
      const cid = this.fval('convo_id');
      if (cid && p.last_read) touchConvo(String(cid), '');
    } else if (t === 'messages') {
      const id = this.fval('id');
      if (id && p.pinned !== undefined) {
        const m = await msgById(String(id));
        if (m) togglePin(m.convo_id, String(id));
      }
    } else if (t === 'reports') {
      const id = this.fval('id');
      if (id && p.status) resolveReportLocal(String(id), p.status);
    } else if (t === 'bots') {
      const id = this.fval('id');
      if (id) await bumpBotUses(String(id));
    } else if (t === 'notifications' && me) {
      markAllRead(me.id);
    }
    return ok([]);
  }

  private async doDelete(): Promise<any> {
    const t = this.table;
    const me = ID.loadSession();
    if (t === 'posts') {
      const id = this.fval('id');
      if (id) await deletePost(String(id));
    } else if (t === 'messages') {
      const id = this.fval('id');
      const cid = this.fval('convo_id');
      if (id) {
        // best-effort Nostr deletion + local tombstone
        try {
          const { npublish } = await import('../hybrid/nostr');
          if (me) await npublish({ kind: 5, content: 'del', tags: [['e', String(id)]] }, me.sk).catch(() => {});
        } catch {}
        if (cid) msgListCache.delete(String(cid));
      } else if (cid) {
        msgListCache.delete(String(cid)); // expired cleanup is filter-based at read
      }
    } else if (t === 'likes' && me) {
      await setLike(String(this.fval('post_id')), '', false);
    } else if (t === 'follows' && me) {
      await setFollow(String(this.fval('followee_id')), false);
    } else if (t === 'reactions' && me) {
      await setReact(String(this.fval('message_id')), String(this.fval('emoji')), false);
    } else if (t === 'ai_memories') {
      const id = this.fval('id');
      lsSet(MEM_K, lsGet<Row>(MEM_K).filter(r => r.id !== id));
    }
    return ok([]);
  }
}

// ---------- realtime channels ----------
interface Handler { type: string; filter: any; cb: (p: any) => void }
class HChannel {
  name: string;
  opts: any;
  private handlers: Handler[] = [];
  private unsubs: (() => void)[] = [];
  private started = false;
  constructor(name: string, opts?: any) { this.name = name; this.opts = opts; }
  on(type: string, filter: any, cb?: (p: any) => void): this {
    const fn = (typeof filter === 'function' ? filter : cb) as (p: any) => void;
    const flt = typeof filter === 'function' ? {} : filter;
    this.handlers.push({ type, filter: flt || {}, cb: fn });
    return this;
  }
  subscribe(statusCb?: (s: string) => void): this {
    if (this.started) { statusCb?.('SUBSCRIBED'); return this; }
    this.started = true;
    (async () => {
      for (const h of this.handlers) {
        try {
          if (h.type === 'postgres_changes') this.wireTable(h);
          else if (h.type === 'presence') this.wirePresence(h);
          else if (h.type === 'broadcast') await this.wireBroadcast(h);
        } catch {}
      }
      statusCb?.('SUBSCRIBED');
    })();
    return this;
  }
  private wireTable(h: Handler) {
    const table = h.filter?.table as string;
    const filterStr = String(h.filter?.filter || '');
    const m = filterStr.match(/(\w+)=eq\.(.+)/);
    if (table === 'posts') {
      this.unsubs.push(subPosts(p => h.cb({ new: p })));
    } else if (table === 'messages' && m) {
      const cid = m[2];
      this.unsubs.push(subConvo(cid, msg => h.cb({ new: msg })));
    } else if (table === 'reactions') {
      this.unsubs.push(subReacts(() => h.cb({})));
    } else if (table === 'notifications') {
      this.unsubs.push(onPush(n => {
        if (!m || String((n as any)[m[1]]) === m[2]) h.cb({ new: n });
      }));
    }
  }
  private wirePresence(h: Handler) {
    const key = this.opts?.config?.presence?.key as string | undefined;
    if (key && h.filter?.event === 'sync') {
      // tracker side: announce self
      const me = ID.loadSession();
      if (me) announce(me.id, me.name, me.avatar).catch(() => {});
    } else {
      this.unsubs.push(onOnline(() => h.cb({})));
      setTimeout(() => h.cb({}), 500);
    }
  }
  private async wireBroadcast(h: Handler) {
    const ev = h.filter?.event as string | undefined;
    const room = 'ch-' + this.name.replace(/[^a-zA-Z0-9_-]/g, '');
    if (this.name.startsWith('typing:')) {
      this.unsubs.push(await onTyping(this.name.slice(7), (m: any) => {
        if (!ev || (m as any)?.event === ev) h.cb({ payload: (m as any)?.payload });
      }));
    } else {
      this.unsubs.push(await onSignal(room, (m: any) => {
        if (!ev || (m as any)?.event === ev) h.cb({ payload: (m as any)?.payload });
      }));
    }
  }
  async track(payload: any): Promise<void> {
    if (this.name === 'online' && payload?.uid) {
      await announce(payload.uid, payload.name || '', null).catch(() => {});
    }
  }
  async send(msg: { type: string; event: string; payload: any }): Promise<void> {
    if (msg?.type !== 'broadcast') return;
    if (this.name.startsWith('typing:')) {
      await sendTyping(this.name.slice(7), { event: msg.event, payload: msg.payload }).catch(() => {});
    } else {
      const room = 'ch-' + this.name.replace(/[^a-zA-Z0-9_-]/g, '');
      await sendSignal(room, { event: msg.event, payload: msg.payload }).catch(() => {});
    }
  }
  presenceState(): Record<string, any> {
    return presenceSnapshot();
  }
  close() {
    this.unsubs.forEach(u => { try { u(); } catch {} });
    this.unsubs = [];
    this.started = false;
  }
}

// ---------- auth ----------
function toUser(s: ID.Session) { return ID.compatUser(s); }
const auth = {
  async signUp({ email, password, options }: { email: string; password: string; options?: { data?: { name?: string } } }) {
    try {
      const s = await ID.signUp(email, password, options?.data?.name || email.split('@')[0]);
      await saveProfile({ name: s.name }).catch(() => {});
      try {
        const bl = await loadBanlist();
        if (ADMIN_EMAILS.includes(s.email.toLowerCase()) && bl.admins.length === 0) {
          await applyMod('claimAdmin', s.id);
        }
      } catch {}
      startNotifyEngine();
      return { data: { user: toUser(s) }, error: null };
    } catch (e) {
      return { data: {}, error: { message: String(e).slice(0, 200) } };
    }
  },
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const s = await ID.signIn(email, password);
      // verify the account exists on relays (wrong password => unknown pubkey)
      try {
        const { nquery } = await import('../hybrid/nostr');
        const { READ_RELAYS } = await import('../hybrid/config');
        const evs = await nquery({ kinds: [0], authors: [s.id], limit: 1 }, READ_RELAYS, 6000);
        if (!evs[0]) {
          const prev = (() => { try { return localStorage.getItem('legion-id-seen-' + s.id); } catch { return null; } })();
          if (!prev) {
            ID.signOut();
            return { data: {}, error: { message: 'Неверный email или пароль' } };
          }
        } else {
          try { localStorage.setItem('legion-id-seen-' + s.id, '1'); } catch {}
        }
      } catch {}
      startNotifyEngine();
      return { data: { user: toUser(s) }, error: null };
    } catch {
      return { data: {}, error: { message: 'Неверный email или пароль' } };
    }
  },
  async signInWithOAuth(_o: { provider: string; options?: any }) {
    return { data: {}, error: { message: 'В децентрализованном режиме входи по email или через Telegram' } };
  },
  async signOut() { ID.signOut(); return { error: null }; },
  async getSession() {
    const s = ID.loadSession();
    return { data: { session: s ? { user: toUser(s) } : null } };
  },
  async getUser() {
    const s = ID.loadSession();
    return { data: { user: s ? toUser(s) : null } };
  },
  onAuthStateChange(cb: (ev: string, session: any) => void) {
    const off = ID.onAuth(s => cb(s ? 'SIGNED_IN' : 'SIGNED_OUT', s ? { user: toUser(s) } : null));
    return { data: { subscription: { unsubscribe: off } } };
  },
};

// ---------- storage ----------
const storage = {
  from(_bucket: string) {
    return {
      async upload(path: string, file: File) {
        if (file.size > 200_000_000) return { data: null, error: { message: 'Файл >200МБ — отправь через торрент (P2P)' } };
        try {
          const url = await uploadFile(file);
          rememberUrl(path, url);
          return { data: { path }, error: null };
        } catch (e) {
          return { data: null, error: { message: 'Загрузка не удалась: ' + String(e).slice(0, 120) } };
        }
      },
      getPublicUrl(path: string) {
        return { data: { publicUrl: lookupUrl(path) || path } };
      },
    };
  },
};

// ---------- client singleton ----------
export interface HybridClient {
  from: (t: string) => QB;
  channel: (n: string, o?: any) => HChannel;
  removeChannel: (c: HChannel) => void;
  auth: typeof auth;
  storage: typeof storage;
}
let _c: HybridClient | null = null;
export function supaBrowser(): HybridClient {
  if (!_c) {
    _c = {
      from: (t: string) => new QB(t),
      channel: (n: string, o?: any) => new HChannel(n, o),
      removeChannel: (c: HChannel) => { try { c.close(); } catch {} },
      auth, storage,
    };
  }
  return _c;
}
export { pushNotif };
