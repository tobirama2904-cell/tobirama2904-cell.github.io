// Free unlimited file storage cascade (zero keys by default):
// Telegram bot (if configured) -> litterbox(1GB tmp) -> catbox -> uguu.se -> Blossom/NIP-98 -> dataURL.
// + client-side compression (video re-encode / image resize), progress, dynamic timeouts, retries.
import { UPLOAD_HOSTS, BLOSSOM_SERVERS, tgToken, tgChat } from './config';
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

// ---------- compression ----------
export async function compressImage(f: File): Promise<File> {
  if (!f.type.startsWith('image/') || f.size < 1_000_000) return f;
  try {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    const blob: Blob | null = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.82));
    if (!blob || blob.size >= f.size) return f;
    return new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return f; }
}

// Re-encode big video to 720p via native MediaRecorder (no downloads, no libs).
export async function compressVideo(f: File, onTick?: (s: string) => void): Promise<File> {
  if (!f.type.startsWith('video/') || f.size < 12_000_000) return f;
  try {
    const url = URL.createObjectURL(f);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    await new Promise((res, rej) => { v.onloadedmetadata = () => res(0); v.onerror = () => rej(new Error('meta')); });
    const scale = Math.min(1, 720 / Math.min(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * scale / 2) * 2, h = Math.round(v.videoHeight * scale / 2) * 2;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d')!;
    const stream: MediaStream = (cv as HTMLCanvasElement).captureStream(30);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
    const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_200_000 });
    const chunks: Blob[] = [];
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise<void>((res, rej) => { mr.onstop = () => res(); mr.onerror = () => rej(new Error('rec')); });
    const draw = () => { if (!v.paused && !v.ended) ctx.drawImage(v, 0, 0, w, h); };
    const timer = setInterval(draw, 33);
    mr.start(500);
    onTick?.('🎬 Сжимаю видео…');
    await v.play().catch(() => {});
    await new Promise<void>((res) => {
      const to = setTimeout(() => res(), 125000);
      v.onended = () => { clearTimeout(to); res(); };
    });
    clearInterval(timer);
    mr.stop();
    (stream.getTracks() || []).forEach(t => { try { t.stop(); } catch {} });
    URL.revokeObjectURL(url);
    await done;
    const blob = new Blob(chunks, { type: 'video/webm' });
    if (!blob.size || blob.size >= f.size) return f;
    return new File([blob], f.name.replace(/\.\w+$/, '') + '.webm', { type: 'video/webm' });
  } catch { return f; }
}

// ---------- transport (XHR for upload progress) ----------
function xpost(url: string, body: FormData | ArrayBuffer, headers: Record<string, string>, ms: number, onProg?: (p: number) => void): Promise<string> {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    const to = setTimeout(() => { try { x.abort(); } catch {} rej(new Error('timeout')); }, ms);
    x.upload.onprogress = e => { if (e.lengthComputable && e.total > 0) { try { onProg?.(Math.round(e.loaded / e.total * 100)); } catch {} } };
    x.onload = () => { clearTimeout(to); if (x.status >= 200 && x.status < 300) res(x.responseText); else rej(new Error('http' + x.status)); };
    x.onerror = () => { clearTimeout(to); rej(new Error('net')); };
    x.onabort = () => { clearTimeout(to); rej(new Error('abort')); };
    x.open('POST', url);
    Object.entries(headers).forEach(([k, val]) => x.setRequestHeader(k, val));
    x.send(body as never);
  });
}
function xput(url: string, body: ArrayBuffer, headers: Record<string, string>, ms: number, onProg?: (p: number) => void): Promise<string> {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    const to = setTimeout(() => { try { x.abort(); } catch {} rej(new Error('timeout')); }, ms);
    x.upload.onprogress = e => { if (e.lengthComputable && e.total > 0) { try { onProg?.(Math.round(e.loaded / e.total * 100)); } catch {} } };
    x.onload = () => { clearTimeout(to); if (x.status >= 200 && x.status < 300) res(x.responseText); else rej(new Error('http' + x.status)); };
    x.onerror = () => { clearTimeout(to); rej(new Error('net')); };
    x.onabort = () => { clearTimeout(to); rej(new Error('abort')); };
    x.open('PUT', url);
    Object.entries(headers).forEach(([k, val]) => x.setRequestHeader(k, val));
    x.send(body);
  });
}
// timeout scales with size: 30s base + ~1s per 60KB, capped 5 min
function budget(f: File | Blob, size?: number): number {
  const s = size ?? (f as File).size ?? 0;
  return Math.min(300000, Math.max(30000, Math.round(s / 60000) * 1000));
}
async function retry<T>(fn: () => Promise<T>, n = 1): Promise<T> {
  let err: unknown = null;
  for (let i = 0; i <= n; i++) {
    try { return await fn(); } catch (e) { err = e; }
  }
  throw err;
}

async function viaLitterbox(f: File, onProg?: (p: number) => void): Promise<string> {
  const fd = new FormData();
  fd.append('reqtype', 'fileupload');
  fd.append('time', '72h');
  fd.append('fileToUpload', f);
  const t = (await xpost('https://litterbox.catbox.moe/resources/internals/api.php', fd, {}, budget(f), onProg)).trim();
  if (!t.startsWith('http')) throw new Error('litterbox');
  return t;
}
async function viaCatbox(f: File, onProg?: (p: number) => void): Promise<string> {
  const fd = new FormData();
  fd.append('reqtype', 'fileupload');
  fd.append('fileToUpload', f);
  const t = (await xpost(UPLOAD_HOSTS.catbox, fd, {}, budget(f), onProg)).trim();
  if (!t.startsWith('http')) throw new Error('catbox');
  return t;
}
async function viaUguu(f: File, onProg?: (p: number) => void): Promise<string> {
  const fd = new FormData();
  fd.append('files[]', f);
  const txt = await xpost(UPLOAD_HOSTS.uguu, fd, {}, budget(f), onProg);
  const j = JSON.parse(txt);
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
async function viaBlossom(f: File, onProg?: (p: number) => void): Promise<string> {
  const buf = await f.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const sha = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
  for (const srv of BLOSSOM_SERVERS) {
    try {
      const url = `${srv}/${sha}`;
      const auth = await nip98Auth(url, 'PUT');
      const txt = await xput(url, buf, { Authorization: auth, 'Content-Type': f.type || 'application/octet-stream' }, budget(f, buf.byteLength), onProg);
      try {
        const j = JSON.parse(txt);
        return j?.url || url;
      } catch { return url; }
    } catch { /* next server */ }
  }
  throw new Error('blossom');
}
async function viaTelegram(f: File, onProg?: (p: number) => void): Promise<string> {
  const tok = tgToken(), chat = tgChat();
  if (!tok || !chat) throw new Error('tg-off');
  const fd = new FormData();
  fd.append('chat_id', chat);
  fd.append('document', f, f.name);
  const txt = await xpost(`https://api.telegram.org/bot${tok}/sendDocument`, fd, {}, budget(f), onProg);
  const j = JSON.parse(txt);
  const fid = j?.result?.document?.file_id;
  if (!fid) throw new Error('tg-up');
  const g = await (await fetch(`https://api.telegram.org/bot${tok}/getFile?file_id=${fid}`, { signal: AbortSignal.timeout(15000) })).json();
  const path = g?.result?.file_path;
  if (!path) throw new Error('tg-file');
  return `https://api.telegram.org/file/bot${tok}/${path}`;
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

export async function uploadFile(f: File, onProg?: (p: number, host: string) => void): Promise<string> {
  const errs: string[] = [];
  const chain: [string, () => Promise<string>][] = [];
  if (tgToken() && tgChat()) chain.push(['tg', () => retry(() => viaTelegram(f, p => onProg?.(p, 'tg')))]);
  chain.push(['litterbox', () => retry(() => viaLitterbox(f, p => onProg?.(p, 'litterbox')))]);
  chain.push(['catbox', () => retry(() => viaCatbox(f, p => onProg?.(p, 'catbox')))]);
  chain.push(['uguu', () => retry(() => viaUguu(f, p => onProg?.(p, 'uguu')))]);
  chain.push(['blossom', () => viaBlossom(f, p => onProg?.(p, 'blossom'))]);
  chain.push(['dataurl', () => viaDataUrl(f)]);
  for (const [name, fn] of chain) {
    try {
      onProg?.(0, name);
      return await fn();
    } catch {
      errs.push(name);
    }
  }
  throw new Error('upload-failed:' + errs.join(','));
}
