// Free unlimited file storage cascade (zero keys by default):
// Telegram bot (if configured) -> catbox -> uguu.se -> Blossom/NIP-98 -> dataURL.
import { UPLOAD_HOSTS, BLOSSOM_SERVERS, TG_BOT_TOKEN, TG_STORAGE_CHAT } from './config';
import { loadSession } from './identity';
import { finalizeEvent, type Event as NEvent } from 'nostr-tools';
import { hexToBytes, ts } from './nostr';

const MAP_K = 'legion-upload-map-v1';
function urlMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(MAP_K) || '{}'); } catch { return {}; }
}
function saveMap(m: Record<string, string>) {
  try {
    const ks = Object.keys(m);
    if (ks.length > 500) ks.slice(0, ks.length - 500).forEach(k => delete m[k]);
    localStorage.setItem(MAP_K, JSON.stringify(m));
  } catch {}
}
export function rememberUrl(path: string, url: string) {
  const m = urlMap(); m[path] = url; saveMap(m);
}
export function lookupUrl(path: string): string | null {
  if (/^https?:|^blob:|^data:|^magnet:/.test(path)) return path;
  return urlMap()[path] || null;
}

async function viaCatbox(f: File): Promise<string> {
  const fd = new FormData();
  fd.append('reqtype', 'fileupload');
  fd.append('fileToUpload', f);
  const r = await fetch(UPLOAD_HOSTS.catbox, { method: 'POST', body: fd });
  const t = (await r.text()).trim();
  if (!t.startsWith('http')) throw new Error('catbox');
  return t;
}
async function viaUguu(f: File): Promise<string> {
  const fd = new FormData();
  fd.append('files[]', f);
  const r = await fetch(UPLOAD_HOSTS.uguu, { method: 'POST', body: fd });
  const j = await r.json();
  const u = j?.files?.[0]?.url;
  if (!u) throw new Error('uguu');
  return u;
}
async function nip98Auth(url: string, method: string): Promise<string> {
  const s = loadSession();
  if (!s) throw new Error('no-session');
  const ev: NEvent = finalizeEvent(
    { kind: 27235, content: '', tags: [['u', url], ['method', method]], created_at: ts() },
    hexToBytes(s.sk),
  );
  return 'Nostr ' + btoa(JSON.stringify(ev));
}
async function viaBlossom(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const sha = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
  for (const srv of BLOSSOM_SERVERS) {
    try {
      const url = `${srv}/${sha}`;
      const auth = await nip98Auth(url, 'PUT');
      const r = await fetch(url, { method: 'PUT', headers: { Authorization: auth, 'Content-Type': f.type || 'application/octet-stream' }, body: buf });
      if (!r.ok) continue;
      const j = await r.json().catch(() => null);
      const out = j?.url || url;
      // verify readable
      return out;
    } catch { /* next server */ }
  }
  throw new Error('blossom');
}
async function viaTelegram(f: File): Promise<string> {
  if (!TG_BOT_TOKEN || !TG_STORAGE_CHAT) throw new Error('tg-off');
  const fd = new FormData();
  fd.append('chat_id', TG_STORAGE_CHAT);
  fd.append('document', f, f.name);
  const r = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendDocument`, { method: 'POST', body: fd });
  const j = await r.json();
  const fid = j?.result?.document?.file_id;
  if (!fid) throw new Error('tg-up');
  const g = await (await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/getFile?file_id=${fid}`)).json();
  const path = g?.result?.file_path;
  if (!path) throw new Error('tg-file');
  return `https://api.telegram.org/file/bot${TG_BOT_TOKEN}/${path}`;
}
function viaDataUrl(f: File): Promise<string> {
  if (f.size > 1_500_000) return Promise.reject(new Error('too-big'));
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(new Error('dataurl'));
    fr.readAsDataURL(f);
  });
}

export async function uploadFile(f: File): Promise<string> {
  const errs: string[] = [];
  const chain: [string, () => Promise<string>][] = [];
  if (TG_BOT_TOKEN && TG_STORAGE_CHAT) chain.push(['tg', () => viaTelegram(f)]);
  chain.push(['catbox', () => viaCatbox(f)]);
  chain.push(['uguu', () => viaUguu(f)]);
  chain.push(['blossom', () => viaBlossom(f)]);
  chain.push(['dataurl', () => viaDataUrl(f)]);
  for (const [name, fn] of chain) {
    try {
      return await fn();
    } catch (e) {
      errs.push(name);
    }
  }
  throw new Error('upload-failed:' + errs.join(','));
}
