'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Mic, MicOff, X } from 'lucide-react';
import { voice, type VoiceState } from '@/lib/voice/engine';
import { runVoiceCommand } from '@/lib/voice/commands';
import { useStore } from '@/lib/store';

export function VoiceWidget() {
  const open = useStore(s => s.voiceOpen);
  const setOpen = useStore(s => s.setVoice);
  const toggleTheme = useStore(s => s.toggleTheme);
  const setCmdk = useStore(s => s.setCmdk);
  const router = useRouter();
  const [st, setSt] = useState<VoiceState>({ listening: false, dialog: false, speaking: false, level: 0, lastErr: '', sttOK: false });
  const [lines, setLines] = useState<string[]>([]);
  const push = (t: string) => setLines(l => [...l.slice(-9), t]);
  const stRef = useRef(st); stRef.current = st;

  useEffect(() => {
    const v = voice();
    setSt(v.snapshot());
    const off = [
      v.on('state', s => setSt({ ...s })),
      v.on('interim', t => push('… ' + t)),
      v.on('final', t => {
        push('🎙 ' + t);
        const done = runVoiceCommand(t, {
          go: p => router.push(p), toggleTheme, openCmdk: () => setCmdk(true),
          notify: m => push('ℹ️ ' + m), speak: m => voice().speak(m),
        });
        if (!done) {
          push('🤖 ' + t.slice(0, 60) + '… → отправляю в AI-чат');
          router.push('/chat');
        }
      }),
      v.on('wake', k => push(k === 'name' ? '👂 Слушаю, босс!' : '👂 Команда принята')),
    ];
    return () => off.forEach(u => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggle = async () => {
    const v = voice();
    if (!v.sttOK) { push('⛔ Браузер не умеет распознавать речь. Нужен Chrome.'); return; }
    if (!v.listening) {
      const { micPermission } = await import('@/lib/voice/engine');
      const p = await micPermission();
      if (p !== 'granted') { push('🎙 Нет доступа к микрофону (' + p + '). Разреши в браузере.'); return; }
      v.startListen(); v.openDialog(60); push('🎙 Слушаю… скажи «Легион» или команду');
    } else { v.stopListen(); push('⏹ Остановлено'); }
  };
  return <AnimatePresence>
    {open && <motion.div initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.95 }} className="fixed bottom-20 lg:bottom-6 right-3 sm:right-6 z-[60] w-[calc(100vw-1.5rem)] max-w-sm glass rounded-3xl shadow-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={toggle} className={`size-12 rounded-full grid place-items-center text-white shadow-xl transition active:scale-90 ${st.listening ? 'bg-rose-500 animate-pulse' : 'bg-gradient-to-br from-blue-600 to-cyan-500'}`}>
          {st.listening ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <div className="flex-1"><b className="text-sm">Голосовой помощник</b><div className="text-[11px] text-zinc-500">{st.listening ? (st.dialog ? '◉ диалог' : '◉ слушаю') : '○ выкл'}{st.lastErr ? ` · ⚠ ${st.lastErr}` : ''}</div></div>
        <button onClick={() => setOpen(false)} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500"><X size={16} /></button>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden mb-3"><div className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all" style={{ width: `${Math.round((st.speaking ? st.level : st.listening ? 0.12 : 0) * 100)}%` }} /></div>
      <div className="min-h-28 max-h-52 overflow-y-auto rounded-xl bg-zinc-100 dark:bg-black/30 p-3 text-[13px] font-medium flex flex-col gap-1">
        {lines.length === 0 && <span className="text-zinc-400">Нажми микрофон и говори. Команды: «открой ленту», «тёмная тема», «позови…»</span>}
        {lines.map((l, i) => <div key={i} className="animate-[msgIn_.25s]">{l}</div>)}
      </div>
      <div className="text-[11px] text-zinc-400 mt-2 font-semibold">Wake word «Легион» работает, пока слушаю · Chrome рекоменд.</div>
    </motion.div>}
  </AnimatePresence>;
}
