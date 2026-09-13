// Serverless big files: WebTorrent in the browser. Seed while the page is open,
// fetch by magnet from any peer. Unlimited size, zero servers.
import { WS_TRACKERS } from './config';

let client: any = null;
async function wt(): Promise<any> {
  if (!client) {
    const m = (await import('webtorrent')) as any;
    const WT = m.default || m;
    client = new WT({
      tracker: { rtcConfig: { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] } },
    });
  }
  return client;
}
export async function seedFile(f: File): Promise<string> {
  const c = await wt();
  return new Promise((res, rej) => {
    try {
      c.seed(f, { announce: WS_TRACKERS }, (t: any) => res(t.magnetURI as string));
    } catch (e) { rej(e); }
  });
}
const blobCache = new Map<string, string>();
export async function fetchMagnet(magnet: string): Promise<string> {
  const hit = blobCache.get(magnet);
  if (hit) return hit;
  const c = await wt();
  const url: string = await new Promise((res, rej) => {
    try {
      const t = c.get(magnet) || c.add(magnet, { announce: WS_TRACKERS });
      const done = (tor: any) => {
        const file = (tor.files || []).sort((a: any, b: any) => b.length - a.length)[0];
        if (!file) { rej(new Error('no-file')); return; }
        file.getBlob((err: unknown, blob: Blob | undefined) => {
          if (err || !blob) { rej(err || new Error('blob')); return; }
          const u = URL.createObjectURL(blob);
          blobCache.set(magnet, u);
          res(u);
        });
      };
      if (t.ready) done(t);
      else t.on('ready', () => done(t));
      t.on('error', rej);
      setTimeout(() => rej(new Error('torrent-timeout')), 120000);
    } catch (e) { rej(e); }
  });
  return url;
}
export function isMagnet(u: string): boolean { return u.startsWith('magnet:'); }
