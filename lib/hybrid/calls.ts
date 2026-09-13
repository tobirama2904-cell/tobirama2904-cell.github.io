// P2P voice/video calls: WebRTC media + Trystero-lobby signaling.
// Same public API as the old Supabase-signalled client.
import { sendSignal, onSignal } from './live';
import { APP_ID, RELAYS, T_VOICE } from './config';
import { nquery, npublish, tag, iso } from './nostr';
import { loadSession } from './identity';

export type CallState = 'idle' | 'calling' | 'ringing' | 'in-call';
export interface CallEvents {
  onState: (s: CallState, peer?: string) => void;
  onRemoteStream: (s: MediaStream) => void;
  onEnd: () => void;
}
const RTC_CFG: RTCConfiguration = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };
const LOBBY = 'lobby';

interface SigMsg { to: string; from: string; fromName: string; type: string; sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit; video?: boolean }

export class CallClient {
  private pc: RTCPeerConnection | null = null;
  private local: MediaStream | null = null;
  private ev: CallEvents;
  private myId = '';
  private iceBuf: RTCIceCandidateInit[] = [];
  private offerCache: RTCSessionDescriptionInit | null = null;
  private offSig: (() => void) | null = null;
  private wantVideo = false;
  peer = '';

  constructor(ev: CallEvents) { this.ev = ev; }

  listen(uid: string) {
    this.myId = uid;
    onSignal(LOBBY, async (payload: unknown) => {
      const p = payload as SigMsg;
      if (!p || p.to !== this.myId) return;
      if (p.type === 'invite') {
        this.peer = p.from;
        this.offerCache = p.sdp || null;
        this.wantVideo = !!p.video;
        this.ev.onState('ringing', p.fromName);
      } else if (p.type === 'answer' && this.pc) {
        try { await this.pc.setRemoteDescription(p.sdp!); this.ev.onState('in-call'); } catch {}
      } else if (p.type === 'ice' && p.ice) {
        if (this.pc && this.pc.remoteDescription) { try { await this.pc.addIceCandidate(p.ice); } catch {} }
        else this.iceBuf.push(p.ice);
      } else if (p.type === 'bye') this.hangup(false);
    }).then(off => { this.offSig = off; }).catch(() => {});
  }

  private async setup() {
    this.pc = new RTCPeerConnection(RTC_CFG);
    this.local = await navigator.mediaDevices.getUserMedia({ audio: true, video: this.wantVideo });
    this.local.getTracks().forEach(t => this.pc!.addTrack(t, this.local!));
    this.pc.ontrack = e => { if (e.streams[0]) this.ev.onRemoteStream(e.streams[0]); };
    this.pc.onicecandidate = e => {
      if (e.candidate) this.signal({ to: this.peer, from: this.myId, fromName: '', type: 'ice', ice: e.candidate.toJSON() });
    };
  }
  private signal(msg: SigMsg) { sendSignal(LOBBY, msg).catch(() => {}); }

  async call(from: string, fromName: string, to: string, video = false) {
    this.peer = to; this.myId = from; this.wantVideo = video;
    await this.setup();
    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);
    this.signal({ to, from, fromName, type: 'invite', sdp: offer, video });
    this.ev.onState('calling');
    // ring note over encrypted DM so offline peers see a missed call
    try {
      const { sendDm } = await import('./dm');
      sendDm(to, { kind: 'system', text: `📞 ${video ? 'Видео' : 'Аудио'}вызов от ${fromName} (открой чат, чтобы принять)` }).catch(() => {});
    } catch {}
  }
  async callVideo(from: string, fromName: string, to: string) { return this.call(from, fromName, to, true); }

  async accept(me: string, myName: string) {
    await this.setup();
    if (this.offerCache) {
      await this.pc!.setRemoteDescription(this.offerCache);
      for (const ice of this.iceBuf) { try { await this.pc!.addIceCandidate(ice); } catch {} }
      this.iceBuf = [];
    }
    const ans = await this.pc!.createAnswer();
    await this.pc!.setLocalDescription(ans);
    this.signal({ to: this.peer, from: me, fromName: myName, type: 'answer', sdp: ans });
    this.ev.onState('in-call');
  }
  decline(me: string, myName: string) {
    if (this.peer) this.signal({ to: this.peer, from: me, fromName: myName, type: 'bye' });
    this.peer = ''; this.ev.onState('idle');
  }
  hangup(notify = true) {
    if (notify && this.peer && this.myId) this.signal({ to: this.peer, from: this.myId, fromName: '', type: 'bye' });
    try { this.pc?.close(); } catch {}
    try { this.local?.getTracks().forEach(t => t.stop()); } catch {}
    this.pc = null; this.local = null; this.peer = ''; this.iceBuf = [];
    this.ev.onState('idle'); this.ev.onEnd();
  }
  destroy() { try { this.offSig?.(); } catch {} this.hangup(false); }
}

// ---------- voice rooms (Trystero audio rooms, Nostr directory, zero servers) ----------
export interface VoiceRoomInfo { id: string; title: string; host: string; hostName: string; created_at: string }
export async function publishVoiceRoom(title: string): Promise<VoiceRoomInfo | null> {
  const s = loadSession();
  if (!s) return null;
  const id = 'vr-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const { event, ok } = await npublish(
    { kind: 1, content: JSON.stringify({ id, title: title.slice(0, 80) }), tags: [['t', T_VOICE], ['title', title.slice(0, 80)]] },
    s.sk,
  );
  if (!ok) return null;
  return { id, title: title.slice(0, 80), host: s.id, hostName: s.name, created_at: iso(event.created_at) };
}
export async function listVoiceRooms(): Promise<VoiceRoomInfo[]> {
  const cutoff = Math.floor(Date.now() / 1000) - 3 * 3600;
  const evs = await nquery({ kinds: [1], '#t': [T_VOICE], since: cutoff, limit: 50 }, RELAYS, 6000);
  const out: VoiceRoomInfo[] = [];
  for (const e of evs) {
    try {
      const j = JSON.parse(e.content);
      if (!j.id) continue;
      out.push({ id: String(j.id), title: tag(e, 'title') || String(j.title || 'Голосовая'), host: e.pubkey, hostName: '', created_at: iso(e.created_at) });
    } catch {}
  }
  return out;
}
export interface VoicePeer { peerId: string; pub: string; name: string }
export interface VoiceHandle {
  setMuted: (m: boolean) => void;
  onPeers: (cb: (p: VoicePeer[]) => void) => void;
  leave: () => void;
}
export async function joinVoiceRoom(roomId: string, onAudio: (peerId: string, stream: MediaStream) => void): Promise<VoiceHandle> {
  const t = await import('trystero');
  const room = t.joinRoom({ appId: APP_ID, relayUrls: RELAYS } as never, 'legion-' + roomId) as any;
  const me = loadSession();
  const peers = new Map<string, VoicePeer>();
  let peersCb: (p: VoicePeer[]) => void = () => {};
  const emit = () => peersCb([...peers.values()]);
  const hello = room.makeAction('hello');
  hello.onMessage = (m: any, ctx: any) => {
    const pid = ctx?.peerId || ctx?.target || '';
    if (m && m.pub && pid) { peers.set(pid, { peerId: pid, pub: String(m.pub), name: String(m.name || 'Гость') }); emit(); }
  };
  room.onPeerStream = (st: MediaStream, pid: string) => { try { onAudio(pid, st); } catch {} };
  room.onPeerJoin = (pid: string) => {
    try { hello.send({ pub: me?.id || '', name: me?.name || 'Гость' }, { target: pid }); } catch {}
  };
  room.onPeerLeave = (pid: string) => { peers.delete(pid); emit(); };
  const stream: MediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  try { await Promise.all(room.addStream(stream) as Promise<void>[]); } catch {}
  // announce to whoever is already inside
  try { hello.send({ pub: me?.id || '', name: me?.name || 'Гость' }); } catch {}
  return {
    setMuted: (m: boolean) => { stream.getAudioTracks().forEach(tr => { tr.enabled = !m; }); },
    onPeers: (cb: (p: VoicePeer[]) => void) => { peersCb = cb; emit(); },
    leave: () => {
      try { stream.getTracks().forEach(tr => tr.stop()); } catch {}
      try { room.leave(); } catch {}
    },
  };
}
