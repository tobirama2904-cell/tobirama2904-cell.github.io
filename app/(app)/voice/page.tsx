'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic, Volume2, Keyboard, Zap, Radio, PhoneOff } from 'lucide-react';
import { voice, micPermission, type VoiceState } from '@/lib/voice/engine';
import { Button, Slider } from '@/components/ui/primitives';
import { useStore } from '@/lib/store';
import { listVoiceRooms, publishVoiceRoom, joinVoiceRoom, type VoiceRoomInfo, type VoicePeer, type VoiceHandle } from '@/lib/hybrid/calls';

export default function VoicePage() {
  const me = useStore(s => s.me);
  const [st, setSt] = useState<VoiceState>({ listening: false, dialog: false, speaking: false, level: 0, lastErr: '', sttOK: false });
  const [log, setLog] = useState<string[]>([]);
  const [voices, setVoices] = useState<{ uri: string; name: string; lang: string }[]>([]);
  const [rate, setRate] = useState(1);
  const setVoiceOpen = useStore(s => s.setVoice);
  const push = (t: string) => setLog(l => [`[${new Date().toLocaleTimeString('ru-RU')}] ${t}`, ...l].slice(0, 40));
  const [voiceURI, setVoiceURI] = useState('');
  const [dialog, setDialog] = useState(false);
  const dialogRef = useRef(false);
  // rooms
  const [rooms, setRooms] = useState<VoiceRoomInfo[]>([]);
  const [roomTitle, setRoomTitle] = useState('');
  const [inRoom, setInRoom] = useState<VoiceRoomInfo | null>(null);
  const [peers, setPeers] = useState<VoicePeer[]>([]);
  const [muted, setMuted] = useState(false);
  const handleRef = useRef<VoiceHandle | null>(null);
  const audioBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const v = voice();
    setSt(v.snapshot()); setVoices(v.listVoices()); setRate(v.rate); setVoiceURI(v.voiceURI);
    const off = [
      v.on('state', s => setSt({ ...s })),
      v.on('final', async t => {
        push('🎙 «' + t + '»');
        if (!dialogRef.current) return;
        try {
          let key = ''; try { key = localStorage.getItem('legion-agnes-key') || ''; } catch {}
          const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: key || undefined, system: 'Ты LEGION, голосовой собеседник. Отвечай вслух: коротко, живо, по-русски, без списков и markdown.', prompt: t }) });
          const j = await r.json();
          if (j.text) { push('🤖 «' + j.text.slice(0, 120) + '»'); voice().speak(j.text); }
          else push('⚠ AI молчит (нужен Agnes-ключ)');
        } catch { push('⚠ Ошибка AI'); }
      }),
      v.on('wake', () => push('👂 Wake word!')),
    ];
    push('Голосовой модуль готов (STT: ' + (v.sttOK ? 'да' : 'нет') + ')');
    setTimeout(() => setVoices(v.listVoices()), 800);
    return () => off.forEach(u => u());
  }, []);
  useEffect(() => {
    if (!me || me.guest) return;
    listVoiceRooms().then(setRooms).catch(() => {});
    return () => { try { handleRef.current?.leave(); } catch {} };
  }, [me]);
  const toggle = async () => {
    const v = voice();
    if (!v.listening) { const p = await micPermission(); push('mic: ' + p); if (p !== 'granted') return; v.startListen(); v.openDialog(120); push('Слушаю постоянно…'); }
    else { v.stopListen(); push('Остановлено'); }
  };
  const testTts = () => { voice().speak('Легион на связи. Озвучка работает отлично.'); push('🔊 Тест озвучки'); };
  const pttDown = async () => { const p = await micPermission(); if (p !== 'granted') { push('PTT: нет доступа'); return; } if (!voice().listening) voice().startListen(); voice().openDialog(120); push('🔴 PTT: говори…'); };
  const pttUp = () => { setTimeout(() => { voice().stopListen(); push('PTT: конец'); }, 500); };
  const createRoom = async () => {
    if (!roomTitle.trim()) return;
    const r = await publishVoiceRoom(roomTitle.trim()).catch(() => null);
    if (r) { setRoomTitle(''); setRooms([r, ...rooms]); joinRoom(r); }
    else push('⚠ Комната не создалась');
  };
  const joinRoom = async (r: VoiceRoomInfo) => {
    if (inRoom) leaveRoom();
    try {
      const p = await micPermission();
      if (p !== 'granted') { push('Нет доступа к микрофону'); return; }
      const h = await joinVoiceRoom(r.id, (pid, stream) => {
        const box = audioBox.current;
        if (!box) return;
        let el = box.querySelector<HTMLAudioElement>(`[data-pid="${pid}"]`);
        if (!el) { el = document.createElement('audio'); el.dataset.pid = pid; (el as HTMLAudioElement).autoplay = true; box.appendChild(el); }
        el.srcObject = stream;
        el.play().catch(() => {});
      });
      h.onPeers(setPeers);
      handleRef.current = h;
      setInRoom(r);
      setMuted(false);
      push('🎙 Вошёл в «' + r.title + '»');
    } catch { push('⚠ Не вошёл в комнату'); }
  };
  const leaveRoom = () => {
    try { handleRef.current?.leave(); } catch {}
    handleRef.current = null;
    setInRoom(null);
    setPeers([]);
    if (audioBox.current) audioBox.current.innerHTML = '';
    push('Вышел из комнаты');
  };
  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    handleRef.current?.setMuted(m);
  };

  return <div className="max-w-2xl mx-auto pb-10">
    <h1 className="font-display font-bold text-xl mb-4">Голос · центр управления</h1>
    {/* voice rooms */}
    {me && !me.guest && <div className="glass rounded-3xl p-5 mb-3">
      <b className="text-sm flex items-center gap-2"><Radio size={15} className="text-rose-500" /> Голосовые комнаты · живой эфир без серверов</b>
      {!inRoom ? <>
        <div className="flex gap-2 mt-2.5">
          <input value={roomTitle} onChange={e => setRoomTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && createRoom()} placeholder="Название эфира…" className="flex-1 h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" />
          <Button size="sm" onClick={createRoom}>🎙 В эфир</Button>
          <Button size="sm" variant="outline" onClick={() => listVoiceRooms().then(setRooms).catch(() => {})}>↻</Button>
        </div>
        <div className="flex flex-col gap-1.5 mt-2.5">
          {rooms.map(r => <div key={r.id} className="flex items-center gap-2.5 rounded-2xl border border-zinc-200 dark:border-white/10 p-3">
            <span className="size-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
            <div className="min-w-0 flex-1"><b className="text-sm">{r.title}</b></div>
            <Button size="sm" onClick={() => joinRoom(r)}>Слушать</Button>
          </div>)}
          {rooms.length === 0 && <div className="text-sm text-zinc-500 text-center py-3">Эфиров нет — запусти первый!</div>}
        </div>
      </> : <div className="mt-2.5 rounded-2xl bg-rose-500/5 border border-rose-500/25 p-4">
        <div className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-rose-500 animate-pulse" /><b className="text-sm">🎙 {inRoom.title}</b>
          <span className="ml-auto text-xs text-zinc-500">в эфире: {peers.length + 1}</span></div>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <span className="text-xs font-bold bg-blue-500/15 text-blue-500 rounded-full px-3 py-1.5">🎤 ты {muted ? '(мут)' : ''}</span>
          {peers.map(p => <span key={p.peerId} className="text-xs font-bold bg-zinc-500/10 rounded-full px-3 py-1.5">🎧 {p.name}</span>)}
        </div>
        <div className="flex gap-2 mt-3">
          <Button size="sm" variant={muted ? 'default' : 'outline'} onClick={toggleMute}>{muted ? '🔇 Размутить' : '🎤 Мут'}</Button>
          <Button size="sm" variant="outline" onClick={leaveRoom} className="!text-rose-500"><PhoneOff size={14} /> Выйти</Button>
        </div>
      </div>}
      <div ref={audioBox} className="hidden" />
    </div>}
    <div className="glass rounded-3xl p-6 flex flex-col items-center gap-4">
      <button onClick={toggle} className={`size-28 rounded-full text-4xl text-white shadow-2xl transition active:scale-90 relative ${st.listening ? 'bg-rose-500' : 'bg-gradient-to-br from-blue-600 to-cyan-500'}`}>
        <Mic size={40} className="mx-auto" />
        {st.listening && <span className="absolute inset-0 rounded-full border-4 border-rose-400 animate-ping" />}
      </button>
      <div className="text-sm font-bold text-zinc-500">{st.listening ? (st.dialog ? '◉ диалог — говори команды' : '◉ слушаю') : '○ нажми чтобы слушать'}</div>
      <div className="flex gap-2 flex-wrap justify-center">
        <Button onMouseDown={pttDown} onMouseUp={pttUp} onTouchStart={pttDown} onTouchEnd={pttUp} variant="ember" className="select-none touch-none">🔴 Держи — говори</Button>
        <Button variant="outline" onClick={() => setVoiceOpen(true)}><Keyboard size={15} /> Мини-панель</Button>
        <Button variant="outline" onClick={testTts}><Volume2 size={15} /> Тест озвучки</Button>
        <Button variant={dialog ? 'default' : 'outline'} onClick={() => { const d = !dialog; setDialog(d); dialogRef.current = d; push(d ? '💬 Диалог с Легионом ВКЛ — говори, он ответит голосом' : '💬 Диалог ВЫКЛ'); }}>💬 Диалог</Button>
      </div>
      <div className="w-full grid sm:grid-cols-2 gap-3">
        <label className="text-xs font-bold text-zinc-500">Голос озвучки
          <select value={voiceURI} onChange={e => { voice().setVoice(e.target.value); setVoiceURI(e.target.value); push('Голос сменён'); }} className="mt-1 w-full h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-2.5 text-sm outline-none">
            <option value="">— авто —</option>
            {voices.map(v => <option key={v.uri} value={v.uri}>{v.name} ({v.lang})</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-zinc-500">Темп речи: {rate.toFixed(2)}×
          <Slider value={[rate]} min={0.7} max={1.4} step={0.05} onValueChange={([r]) => { setRate(r); voice().setRate(r); }} className="mt-2.5" />
        </label>
      </div>
    </div>
    <div className="glass rounded-3xl p-4 mt-3">
      <b className="text-sm flex items-center gap-2"><Zap size={15} className="text-amber-500" /> Команды</b>
      <div className="text-[13px] text-zinc-500 mt-1.5 leading-relaxed font-medium">«Легион» — позвать · «открой ленту / мессенджер / статистику» · «тёмная тема» · «позови…» — всё остальное уходит в AI-чат. Диктовка работает в мини-панели.</div>
    </div>
    <div className="rounded-2xl bg-zinc-950 text-zinc-200 p-4 mt-3 font-mono text-xs max-h-56 overflow-y-auto">
      {log.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  </div>;
}
