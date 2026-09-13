// Moderation without servers: signed banlist.json served by static hosting
// (unlimited reads). Admin publishes via GitHub API from their own browser.
import { GH_REPO } from './config';

export interface BanList {
  admins: string[]; banned: string[]; roles: Record<string, string>; verified: string[]; hidden: string[];
  updated?: string;
}
const LOCAL_K = 'legion-ban-local-v1';
let cache: { at: number; list: BanList } | null = null;

interface LocalOv { banned: string[]; roles: Record<string, string>; verified: string[]; admins: string[]; hidden: string[] }
function localOv(): LocalOv {
  try {
    const raw = localStorage.getItem(LOCAL_K);
    if (raw) return { banned: [], roles: {}, verified: [], admins: [], hidden: [], ...JSON.parse(raw) };
  } catch {}
  return { banned: [], roles: {}, verified: [], admins: [], hidden: [] };
}
function saveLocal(o: LocalOv) { try { localStorage.setItem(LOCAL_K, JSON.stringify(o)); } catch {} }

export async function loadBanlist(): Promise<BanList> {
  if (cache && Date.now() - cache.at < 5 * 60e3) return cache.list;
  let remote: BanList = { admins: [], banned: [], roles: {}, verified: [], hidden: [] };
  try {
    const r = await fetch('/banlist.json', { cache: 'no-store' });
    if (r.ok) remote = { ...remote, ...(await r.json()) };
  } catch {}
  const o = localOv();
  const list: BanList = {
    admins: [...new Set([...remote.admins, ...o.admins])],
    banned: [...new Set([...remote.banned, ...o.banned])],
    roles: { ...remote.roles, ...o.roles },
    verified: [...new Set([...remote.verified, ...o.verified])],
    hidden: [...new Set([...(remote.hidden || []), ...(o.hidden || [])])],
  };
  cache = { at: Date.now(), list };
  return list;
}

// Local enforcement (instant, this device). Optionally publishes to GitHub when token set.
export async function applyMod(action: 'ban' | 'unban' | 'role' | 'verify' | 'unverify' | 'claimAdmin' | 'hide' | 'unhide', pub: string, value = '') {
  const o = localOv();
  if (action === 'ban' && !o.banned.includes(pub)) o.banned.push(pub);
  if (action === 'unban') o.banned = o.banned.filter(x => x !== pub);
  if (action === 'role') o.roles[pub] = value;
  if (action === 'verify' && !o.verified.includes(pub)) o.verified.push(pub);
  if (action === 'unverify') o.verified = o.verified.filter(x => x !== pub);
  if (action === 'claimAdmin' && !o.admins.includes(pub)) o.admins.push(pub);
  if (action === 'hide' && !(o.hidden || []).includes(pub)) o.hidden = [...(o.hidden || []), pub];
  if (action === 'unhide') o.hidden = (o.hidden || []).filter(x => x !== pub);
  saveLocal(o);
  cache = null;
  // best-effort global publish (admin device with token)
  try {
    const token = localStorage.getItem('legion-gh-token') || '';
    if (token && GH_REPO) await publishRemote(token, o);
  } catch {}
  return loadBanlist();
}

async function publishRemote(token: string, o: LocalOv): Promise<boolean> {
  const [owner, repo] = GH_REPO.split('/');
  if (!owner || !repo) return false;
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
  const put = async (path: string, branch: string): Promise<boolean> => {
    try {
      const cur = await (await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, { headers },
      )).json();
      if (!cur.sha) return false;
      let base: BanList = { admins: [], banned: [], roles: {}, verified: [], hidden: [] };
      try { base = { ...base, ...JSON.parse(decodeURIComponent(escape(atob(String(cur.content).replace(/\n/g, ''))))) }; } catch {}
      const merged: BanList = {
        admins: [...new Set([...base.admins, ...o.admins])],
        banned: [...new Set([...base.banned, ...o.banned])],
        roles: { ...base.roles, ...o.roles },
        verified: [...new Set([...base.verified, ...o.verified])],
        hidden: [...new Set([...(base.hidden || []), ...(o.hidden || [])])],
        updated: new Date().toISOString(),
      };
      const body = { message: 'chore: update banlist', content: btoa(unescape(encodeURIComponent(JSON.stringify(merged, null, 2)))), sha: cur.sha, branch };
      const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, { method: 'PUT', headers, body: JSON.stringify(body) });
      return r.ok;
    } catch { return false; }
  };
  // user-site layout (live root + source tree) + project layout fallback
  const a = await put('banlist.json', 'main');
  const b = await put('public/banlist.json', 'source');
  const c = await put('public/banlist.json', 'main');
  return a || b || c;
}

export async function publishNow(): Promise<{ ok: boolean; msg: string }> {
  let token = '';
  try { token = localStorage.getItem('legion-gh-token') || ''; } catch {}
  if (!token) return { ok: false, msg: 'Вставь GitHub-токен ниже и нажми «Опубликовать»' };
  if (!GH_REPO) return { ok: false, msg: 'Нет NEXT_PUBLIC_GH_REPO в сборке' };
  const r = await publishRemote(token, localOv());
  return r ? { ok: true, msg: 'Опубликовано в banlist.json ✅' } : { ok: false, msg: 'GitHub отклонил: проверь токен (нужен scope contents:write)' };
}
