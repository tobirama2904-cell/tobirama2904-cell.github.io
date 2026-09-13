// P2P voice/video calls: WebRTC media + Trystero-lobby signaling.
// Same public API as the old Supabase-signalled client.
import { sendSignal, onSignal } from './live';

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
