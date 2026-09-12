'use client';
// LEGION Voice SDK: Web Speech STT + TTS очередь + wake word + команды. Бесплатно, в браузере.
export interface VoiceState { listening: boolean; dialog: boolean; speaking: boolean; level: number; lastErr: string; sttOK: boolean; }

type Rec = typeof window extends never ? never : any;

type Evt = 'state' | 'interim' | 'final' | 'wake';
export class VoiceEngine {
  private L: Record<Evt, Set<(a: never) => void>> = { state: new Set(), interim: new Set(), final: new Set(), wake: new Set() };
  on(evt: 'state', fn: (s: VoiceState) => void): () => void;
  on(evt: 'wake', fn: (k: 'name' | 'cmd') => void): () => void;
  on(evt: 'interim' | 'final', fn: (t: string) => void): () => void;
  on(evt: Evt, fn: (a: never) => void) { this.L[evt].add(fn); return () => { this.L[evt].delete(fn); }; }
  private fire(evt: Evt, a: never) { this.L[evt].forEach(fn => { try { fn(a); } catch {} }); }
  sttOK = false; listening = false; dialogUntil = 0; speaking = false;
  lastErr = ''; lastHeard = 0; watchName = true;
  private rec: Rec = null; private level = 0; private queue: { text: string; rate: number }[] = [];
  private voices: SpeechSynthesisVoice[] = [];
  voiceURI = ''; rate = 1.0;
  names = ['легион', 'джарвис', 'пятница', 'ультрон', 'вижн'];

  constructor() {
    if (typeof window === 'undefined') return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.sttOK = !!SR;
    try { this.voices = speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => { this.voices = speechSynthesis.getVoices(); }; } catch {}
    try {
      this.voiceURI = localStorage.getItem('legion-voice') || '';
      this.rate = +(localStorage.getItem('legion-rate') || 1);
    } catch {}
  }
  snapshot(): VoiceState {
    return { listening: this.listening, dialog: this.inDialog(), speaking: this.speaking, level: this.level, lastErr: this.lastErr, sttOK: this.sttOK };
  }
  emit() { this.fire('state', this.snapshot() as never); }
  inDialog() { return Date.now() < this.dialogUntil; }
  openDialog(sec = 9) { this.dialogUntil = Date.now() + sec * 1000; this.emit(); }
  listVoices() { return (this.voices.length ? this.voices : speechSynthesis.getVoices()).map(v => ({ uri: v.voiceURI, name: v.name, lang: v.lang })); }

  startListen(): boolean {
    if (!this.sttOK || this.listening) return this.listening;
    try {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const rec = new SR();
      rec.lang = 'ru-RU'; rec.continuous = true; rec.interimResults = true;
      this.lastErr = '';
      rec.onresult = (ev: any) => {
        let interim = '', finals: string[] = [];
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) finals.push(r[0].transcript.trim()); else interim += r[0].transcript;
        }
        if (interim) this.fire('interim', interim as never);
        if (finals.length) { this.lastHeard = Date.now(); finals.forEach(t => this.handleFinal(t)); }
      };
      rec.onerror = (ev: any) => {
        const err = ev.error || 'unknown';
        if (err === 'not-allowed' || err === 'service-not-allowed') { this.lastErr = err; this.stopListen(); }
        else if (err !== 'no-speech' && err !== 'aborted') this.lastErr = err;
        this.emit();
      };
      rec.onend = () => {
        this.rec = null;
        if (this.listening) { try { setTimeout(() => { if (this.listening) this.startListen(); }, 400); } catch {} }
      };
      rec.start();
      this.rec = rec; this.listening = true; this.emit();
      return true;
    } catch (e: any) { this.lastErr = e?.message || 'start-failed'; this.emit(); return false; }
  }
  stopListen() {
    this.listening = false;
    try { this.rec?.stop?.(); } catch {}
    this.rec = null; this.emit();
  }
  toggleListen() { return this.listening ? (this.stopListen(), false) : this.startListen(); }
  private handleFinal(text: string) {
    const low = text.toLowerCase().trim();
    const hitName = this.names.find(n => low.includes(n));
    // wake word открывает диалог; команда после имени выполняется сразу
    if (this.watchName && hitName && !this.inDialog()) {
      this.openDialog(12);
      const cmd = low.split(hitName)[1]?.trim() || '';
      this.fire('wake', (cmd.length > 1 ? 'cmd' : 'name') as never);
      this.fire('final', (cmd.length > 1 ? cmd : text) as never);
      return;
    }
    if (this.inDialog()) this.openDialog(12); // продлеваем диалог, пока говорят
    this.fire('final', text as never);
  }
  speak(text: string, rate?: number) {
    const clean = String(text || '').replace(/[#*`>|]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, 600);
    if (!clean.trim()) return;
    this.queue.push({ text: clean, rate: rate || this.rate });
    this.next();
  }
  private speaking_timer: ReturnType<typeof setTimeout> | null = null;
  private next() {
    if (this.speaking || !this.queue.length) return;
    const { text, rate } = this.queue.shift()!;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ru-RU'; u.rate = rate;
      const vs = speechSynthesis.getVoices();
      const pick = vs.find(v => v.voiceURI === this.voiceURI) || vs.find(v => v.lang?.toLowerCase().startsWith('ru')) || null;
      if (pick) u.voice = pick;
      this.speaking = true; this.emit();
      const pulse = () => { this.level = this.speaking ? 0.3 + Math.random() * 0.7 : 0; this.emit(); if (this.speaking) this.speaking_timer = setTimeout(pulse, 140); };
      pulse();
      let finished = false;
      const done = () => { if (finished) return; finished = true; this.speaking = false; this.level = 0; this.emit(); setTimeout(() => this.next(), 120); };
      u.onend = u.onerror = done;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      setTimeout(() => { if (!finished) { try { speechSynthesis.cancel(); } catch {} done(); } }, Math.max(8000, text.length * 220));
    } catch { this.speaking = false; this.emit(); }
  }
  stopSpeak() { this.queue = []; try { speechSynthesis.cancel(); } catch {} this.speaking = false; this.level = 0; this.emit(); }
  setVoice(uri: string) { this.voiceURI = uri; try { localStorage.setItem('legion-voice', uri); } catch {} }
  setRate(r: number) { this.rate = r; try { localStorage.setItem('legion-rate', String(r)); } catch {} }
}
let _ve: VoiceEngine | null = null;
export function voice(): VoiceEngine {
  if (!_ve) _ve = new VoiceEngine();
  return _ve;
}
export async function micPermission(): Promise<'granted' | 'denied' | 'unsupported' | 'error'> {
  try {
    if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
    try {
      if (navigator.permissions?.query) {
        const st = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (st.state === 'granted') return 'granted';
        if (st.state === 'denied') return 'denied';
      }
    } catch {}
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach(t => t.stop());
    return 'granted';
  } catch (e: any) { return /NotAllowed|denied|Permission/i.test((e?.name || '') + (e?.message || '')) ? 'denied' : 'error'; }
}
