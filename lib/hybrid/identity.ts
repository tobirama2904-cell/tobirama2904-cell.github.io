// Hybrid identity: deterministic Nostr keypairs from email+password (zero servers),
// key import, Telegram attach. Same credentials = same account on any device.
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { bytesToHex, hexToBytes } from './nostr';

export interface TgInfo { id: number; username?: string; first_name?: string; photo_url?: string }
export interface Session {
  id: string; email: string; name: string; avatar: string | null;
  sk: string; method: 'pass' | 'key' | 'tg'; tg?: TgInfo;
}

const K = 'legion-id-v1';
const K2 = 'legion-id-backup-v1'; // redundant mirror
const listeners = new Set<(s: Session | null) => void>();
function emit(s: Session | null) { listeners.forEach(fn => { try { fn(s); } catch {} }); }

function parseSession(raw: string | null): Session | null {
  try {
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s && s.id && s.sk ? s : null;
  } catch { return null; }
}
export function loadSession(): Session | null {
  try {
    const s = parseSession(localStorage.getItem(K));
    if (s) return s;
    const b = parseSession(localStorage.getItem(K2));
    if (b) { try { localStorage.setItem(K, JSON.stringify(b)); } catch {} return b; }
    return null;
  } catch { return null; }
}
export function saveSession(s: Session | null) {
  try {
    if (s) { const raw = JSON.stringify(s); localStorage.setItem(K, raw); localStorage.setItem(K2, raw); }
    else { localStorage.removeItem(K); localStorage.removeItem(K2); }
  } catch {}
  emit(s);
}
export function onAuth(cb: (s: Session | null) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

// Deterministic keypair: PBKDF2(email|pass) -> secp256k1 secret (loop if out of range)
async function derive(email: string, pass: string): Promise<{ sk: string; pub: string }> {
  const enc = new TextEncoder();
  const base = `${email.trim().toLowerCase()}|${pass}`;
  for (let counter = 0; counter < 50; counter++) {
    const km = await crypto.subtle.importKey('raw', enc.encode(base + '|' + counter), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode('legion-v19-identity'), iterations: 60000, hash: 'SHA-256' },
      km, 256,
    );
    const sk = bytesToHex(new Uint8Array(bits));
    try {
      return { sk, pub: getPublicKey(hexToBytes(sk)) };
    } catch { /* out of range, bump counter */ }
  }
  throw new Error('key-derive-failed');
}

export async function signUp(email: string, pass: string, name: string): Promise<Session> {
  const { sk, pub } = await derive(email, pass);
  const s: Session = { id: pub, email: email.trim().toLowerCase(), name: name.trim() || 'Без имени', avatar: null, sk, method: 'pass' };
  saveSession(s);
  return s;
}
export async function signIn(email: string, pass: string): Promise<Session> {
  const { sk, pub } = await derive(email, pass);
  const prev = loadSession();
  const s: Session = {
    id: pub, email: email.trim().toLowerCase(),
    name: prev && prev.id === pub ? prev.name : (email.split('@')[0] || 'Без имени'),
    avatar: prev && prev.id === pub ? prev.avatar : null,
    sk, method: 'pass', tg: prev && prev.id === pub ? prev.tg : undefined,
  };
  saveSession(s);
  return s;
}
export function importKey(input: string): Session {
  const v = input.trim();
  let skBytes: Uint8Array;
  if (v.startsWith('nsec1')) {
    const d = nip19.decode(v);
    if (d.type !== 'nsec') throw new Error('bad-nsec');
    skBytes = d.data as Uint8Array;
  } else {
    skBytes = hexToBytes(v);
    if (skBytes.length !== 32) throw new Error('bad-hex');
  }
  const sk = bytesToHex(skBytes);
  const pub = getPublicKey(skBytes);
  const prev = loadSession();
  const s: Session = {
    id: pub, email: prev && prev.id === pub ? prev.email : '',
    name: prev && prev.id === pub ? prev.name : 'nostr:' + pub.slice(0, 8),
    avatar: prev && prev.id === pub ? prev.avatar : null,
    sk, method: 'key',
  };
  saveSession(s);
  return s;
}
export function attachTelegram(tg: TgInfo): Session {
  const prev = loadSession();
  if (prev) {
    const s: Session = { ...prev, tg, avatar: prev.avatar || tg.photo_url || null };
    saveSession(s);
    return s;
  }
  const skBytes = generateSecretKey();
  const sk = bytesToHex(skBytes);
  const s: Session = {
    id: getPublicKey(skBytes), email: '', name: tg.first_name || tg.username || 'Telegram',
    avatar: tg.photo_url || null, sk, method: 'tg', tg,
  };
  saveSession(s);
  return s;
}
export function exportNsec(): string | null {
  const s = loadSession();
  if (!s) return null;
  try { return nip19.nsecEncode(hexToBytes(s.sk)); } catch { return null; }
}
export function signOut() { saveSession(null); }
export function touchSession(patch: Partial<Session>) {
  const s = loadSession();
  if (s) saveSession({ ...s, ...patch });
}
// Supabase-shaped user for the compat layer
export function compatUser(s: Session) {
  return { id: s.id, email: s.email, user_metadata: { name: s.name, avatar_url: s.avatar } };
}
