// Serverless P2P: Trystero rooms over Nostr signaling.
// Live group chat, typing indicators, presence, file blobs, call signaling.
import { APP_ID, RELAYS } from './config';

type TRMod = typeof import('trystero');
let TR: TRMod | null = null;
async function tr(): Promise<TRMod> {
  if (!TR) TR = await import('trystero');
  return TR;
}

interface RoomBox {
  room: any; chat: any; typing: any; signal: any; file: any;
  chatCbs: Set<(m: any, peer: string) => void>;
  typeCbs: Set<(m: any, peer: string) => void>;
  sigCbs: Set<(m: any, peer: string) => void>;
  fileCbs: Set<(b: Blob, meta: any, peer: string) => void>;
}
const rooms = new Map<string, Promise<RoomBox>>();

function attachRoomEvent(room: any, name: string, fn: (...a: any[]) => void) {
  try {
    const cur = room[name];
    if (typeof cur === 'function' && !(room as any).__legion_mux) {
      // classic API: room.onPeerJoin(fn)
      try { room[name](fn); return; } catch { /* fallthrough */ }
    }
    // new API: assignable property — multiplex manually
    const key = '__legion_' + name;
    if (!room[key]) { room[key] = new Set(); room[name] = (...a: any[]) => room[key].forEach((f: any) => { try { f(...a); } catch {} }); }
    room[key].add(fn);
  } catch {}
}

export function getRoom(id: string): Promise<RoomBox> {
  const key = id;
  if (!rooms.has(key)) {
    rooms.set(key, (async () => {
      const t = await tr();
      const room = t.joinRoom({ appId: APP_ID, relayUrls: RELAYS } as any, 'legion-' + key);
      const box: RoomBox = {
        room, chat: room.makeAction('chat'), typing: room.makeAction('typing'),
        signal: room.makeAction('signal'), file: room.makeAction('file'),
        chatCbs: new Set(), typeCbs: new Set(), sigCbs: new Set(), fileCbs: new Set(),
      };
      box.chat.onMessage = (m: any, ctx: any) => box.chatCbs.forEach(f => { try { f(m, ctx?.peerId); } catch {} });
      box.typing.onMessage = (m: any, ctx: any) => box.typeCbs.forEach(f => { try { f(m, ctx?.peerId); } catch {} });
      box.signal.onMessage = (m: any, ctx: any) => box.sigCbs.forEach(f => { try { f(m, ctx?.peerId); } catch {} });
      box.file.onMessage = (m: any, ctx: any) => {
        if (m instanceof Blob) box.fileCbs.forEach(f => { try { f(m, (ctx as any)?.metadata || {}, ctx?.peerId); } catch {} });
      };
      return box;
    })());
  }
  return rooms.get(key)!;
}

// ---------- live chat ----------
export async function sendChat(roomId: string, msg: unknown): Promise<void> {
  try { (await getRoom(roomId)).chat.send(msg as never); } catch {}
}
export async function onChat(roomId: string, cb: (m: any, peer: string) => void): Promise<() => void> {
  const b = await getRoom(roomId);
  b.chatCbs.add(cb);
  return () => { b.chatCbs.delete(cb); };
}
// ---------- typing ----------
export async function sendTyping(roomId: string, payload: unknown): Promise<void> {
  try { (await getRoom(roomId)).typing.send(payload as never); } catch {}
}
export async function onTyping(roomId: string, cb: (m: any, peer: string) => void): Promise<() => void> {
  const b = await getRoom(roomId);
  b.typeCbs.add(cb);
  return () => { b.typeCbs.delete(cb); };
}
// ---------- generic signal (calls, broadcast channels) ----------
export async function sendSignal(roomId: string, payload: unknown, target?: string): Promise<void> {
  try { (await getRoom(roomId)).signal.send(payload as never, target ? { target } : undefined); } catch {}
}
export async function onSignal(roomId: string, cb: (m: any, peer: string) => void): Promise<() => void> {
  const b = await getRoom(roomId);
  b.sigCbs.add(cb);
  return () => { b.sigCbs.delete(cb); };
}
// ---------- file blobs ----------
export async function sendFile(roomId: string, blob: Blob, meta: Record<string, unknown>, target?: string): Promise<void> {
  (await getRoom(roomId)).file.send(blob as never, { ...(target ? { target } : {}), metadata: meta as never });
}
export async function onFile(roomId: string, cb: (b: Blob, meta: any, peer: string) => void): Promise<() => void> {
  const b = await getRoom(roomId);
  b.fileCbs.add(cb);
  return () => { b.fileCbs.delete(cb); };
}

// ---------- presence (who is online) ----------
export interface PeerInfo { pub: string; name: string; avatar: string | null; at: number }
const peers = new Map<string, PeerInfo>(); // peerId -> info
const onlineCbs = new Set<(ids: string[]) => void>();
let lobbyStarted = false;
let myAnn: PeerInfo | null = null;

function emitOnline() {
  const now = Date.now();
  const ids: string[] = [];
  peers.forEach(p => { if (now - p.at < 45000 && p.pub) ids.push(p.pub); });
  if (myAnn?.pub && !ids.includes(myAnn.pub)) ids.push(myAnn.pub);
  onlineCbs.forEach(f => { try { f([...new Set(ids)]); } catch {} });
}
async function ensureLobby() {
  if (lobbyStarted) return;
  lobbyStarted = true;
  try {
    const b = await getRoom('lobby');
    const annAct = b.room.makeAction('presence');
    annAct.onMessage = (m: any) => {
      const p = m as PeerInfo;
      if (p && p.pub) {
        peers.set(p.pub, { ...p, at: Date.now() });
        emitOnline();
      }
    };
    attachRoomEvent(b.room, 'onPeerLeave', () => setTimeout(emitOnline, 500));
    setInterval(() => {
      if (myAnn) {
        try { annAct.send({ ...myAnn, at: Date.now() }); } catch {}
        emitOnline();
      }
    }, 20000);
    setInterval(emitOnline, 15000);
    (b as any).__ann = annAct;
  } catch { lobbyStarted = false; }
}
export async function announce(pub: string, name: string, avatar: string | null) {
  myAnn = { pub, name, avatar, at: Date.now() };
  await ensureLobby();
  try {
    const b = await getRoom('lobby');
    if ((b as any).__ann) (b as any).__ann.send({ ...myAnn });
  } catch {}
  emitOnline();
}
export function onOnline(cb: (ids: string[]) => void): () => void {
  onlineCbs.add(cb);
  ensureLobby().then(() => emitOnline()).catch(() => {});
  return () => { onlineCbs.delete(cb); };
}
export function presenceSnapshot(): Record<string, { uid: string; name: string }[]> {
  const out: Record<string, { uid: string; name: string }[]> = {};
  const now = Date.now();
  peers.forEach((p, k) => { if (now - p.at < 45000) out[k] = [{ uid: p.pub, name: p.name }]; });
  return out;
}
export function lastSeenMs(pub: string): number {
  const now = Date.now();
  for (const p of peers.values()) if (p.pub === pub && now - p.at < 45000) return p.at;
  if (myAnn?.pub === pub) return now;
  return 0;
}
