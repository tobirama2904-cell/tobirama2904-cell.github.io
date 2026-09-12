'use client';
// P2P аудио-звонки: WebRTC + Supabase Realtime signalling. Бесплатно (STUN Google).
import { supaBrowser } from './supabase/client';

const RTC_CFG: RTCConfiguration = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };

export type CallState = 'idle' | 'calling' | 'ringing' | 'in-call';
export interface CallEvents {
  onState: (s: CallState, peer?: string) => void;
  onRemoteStream: (s: MediaStream) => void;
  onEnd: () => void;
}
export class CallClient {
  private pc: RTCPeerConnection | null = null;
  private local: MediaStream | null = null;
  private ch: ReturnType<ReturnType<typeof supaBrowser>['channel']> | null = null;
  private ev: CallEvents;
  private myId = '';
  private iceBuf: RTCIceCandidateInit[] = [];
  private offerCache: RTCSessionDescriptionInit | null = null;
  peer = '';
  constructor(ev: CallEvents) { this.ev = ev; }
  listen(uid: string) {
    this.myId = uid;
    const sb = supaBrowser();
    this.ch = sb.channel('call:' + uid, { config: { broadcast: { self: false } } });
    this.ch.on('broadcast', { event: 'signal' }, async ({ payload }: { payload: { from: string; fromName: string; type: string; sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit } }) => {
      if (payload.type === 'invite') { this.peer = payload.from; this.offerCache = payload.sdp!; this.ev.onState('ringing', payload.fromName); }
      else if (payload.type === 'answer' && this.pc) { await this.pc.setRemoteDescription(payload.sdp!); this.ev.onState('in-call'); }
      else if (payload.type === 'ice' && payload.ice) {
        if (this.pc && this.pc.remoteDescription) { try { await this.pc.addIceCandidate(payload.ice); } catch {} }
        else this.iceBuf.push(payload.ice); // ранние кандидаты — в буфер
      }
      else if (payload.type === 'bye') this.hangup(false);
    }).subscribe();
  }
  private async setup(to: string) {
    this.pc = new RTCPeerConnection(RTC_CFG);
    this.local = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.local.getTracks().forEach(t => this.pc!.addTrack(t, this.local!));
    this.pc.ontrack = e => e.streams[0] && this.ev.onRemoteStream(e.streams[0]);
    this.pc.onicecandidate = e => { if (e.candidate) this.signalFrom(this.myId, '', to, { type: 'ice', ice: e.candidate.toJSON() }); };
  }
  signalFrom(from: string, fromName: string, to: string, msg: object) {
    const sb = supaBrowser();
    const c = sb.channel('call:' + to);
    c.subscribe(s => { if (s === 'SUBSCRIBED') { c.send({ type: 'broadcast', event: 'signal', payload: { from, fromName, ...msg } }); setTimeout(() => sb.removeChannel(c), 1500); } });
  }
  async call(from: string, fromName: string, to: string) {
    this.peer = to; this.myId = from;
    await this.setup(to);
    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);
    this.signalFrom(from, fromName, to, { type: 'invite', sdp: offer });
    this.ev.onState('calling');
  }
  async accept(me: string, myName: string) {
    await this.setup(this.peer);
    await this.pc!.setRemoteDescription(this.offerCache!);
    for (const ice of this.iceBuf) { try { await this.pc!.addIceCandidate(ice); } catch {} }
    this.iceBuf = [];
    const ans = await this.pc!.createAnswer();
    await this.pc!.setLocalDescription(ans);
    this.signalFrom(me, myName, this.peer, { type: 'answer', sdp: ans });
    this.ev.onState('in-call');
  }
  decline(me: string, myName: string) { if (this.peer) this.signalFrom(me, myName, this.peer, { type: 'bye' }); this.peer = ''; this.ev.onState('idle'); }
  hangup(notify = true) {
    if (notify && this.peer && this.myId) this.signalFrom(this.myId, '', this.peer, { type: 'bye' });
    try { this.pc?.close(); } catch {}
    try { this.local?.getTracks().forEach(t => t.stop()); } catch {}
    this.pc = null; this.local = null; this.peer = ''; this.iceBuf = [];
    this.ev.onState('idle'); this.ev.onEnd();
  }
  destroy() { try { this.ch && supaBrowser().removeChannel(this.ch); } catch {} this.hangup(false); }
}
