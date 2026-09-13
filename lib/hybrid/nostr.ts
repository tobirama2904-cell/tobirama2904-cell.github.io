// Nostr pool layer: queries, publishing, subscriptions across free public relays.
import { SimplePool, finalizeEvent, type Event as NEvent, type Filter } from 'nostr-tools';
import { RELAYS } from './config';

let pool: SimplePool | null = null;
export function getPool(): SimplePool {
  if (!pool) pool = new SimplePool();
  return pool;
}

export async function nquery(filter: Filter, relays: string[] = RELAYS, maxWait = 7000): Promise<NEvent[]> {
  try {
    const evs = await getPool().querySync(relays, filter, { maxWait });
    const seen = new Set<string>();
    const out: NEvent[] = [];
    for (const e of evs) {
      if (!e || seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
    }
    return out.sort((a, b) => b.created_at - a.created_at);
  } catch {
    return [];
  }
}

export interface UnsignedTpl { kind: number; content: string; tags: string[][]; created_at?: number }
export async function npublish(
  tpl: UnsignedTpl, sk: string, relays: string[] = RELAYS,
): Promise<{ event: NEvent; ok: boolean }> {
  const event = finalizeEvent(
    { kind: tpl.kind, content: tpl.content, tags: tpl.tags, created_at: tpl.created_at || ts() },
    hexToBytes(sk),
  );
  let ok = false;
  try {
    const r = (await getPool().publish(relays, event)) as unknown;
    const arr = Array.isArray(r) ? r : [r];
    const res = await Promise.allSettled(arr);
    ok = res.some(x => x.status === 'fulfilled');
  } catch { /* offline */ }
  return { event, ok };
}

export function nsub(relays: string[], filter: Filter, onevent: (e: NEvent) => void): () => void {
  try {
    const c = getPool().subscribeMany(relays, filter, { onevent });
    return () => { try { c.close(); } catch { /* noop */ } };
  } catch {
    return () => {};
  }
}

export const tag = (e: NEvent, n: string): string | undefined => e.tags.find(t => t[0] === n)?.[1];
export const tags = (e: NEvent, n: string): string[] => e.tags.filter(t => t[0] === n).map(t => t[1]);
export const ts = () => Math.floor(Date.now() / 1000);
export const iso = (s: number) => new Date(s * 1000).toISOString();

export function hexToBytes(h: string): Uint8Array {
  const clean = h.trim().toLowerCase().replace(/^0x/, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
export function bytesToHex(b: Uint8Array): string {
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
