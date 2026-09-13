'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import { voice, micPermission } from '@/lib/voice/engine';

// Кнопка диктовки в любое поле ввода: нажал — говоришь — текст дописывается.
export function DictateButton({ onText, className = '' }: { onText: (t: string) => void; className?: string }) {
  const [on, setOn] = useState(false);
  const off = useRef<(() => void) | null>(null);
  const stop = () => { off.current?.(); off.current = null; setOn(false); };
  useEffect(() => stop, []);
  const toggle = async () => {
    if (on) { stop(); return; }
    const v = voice();
    if (!v.sttOK) { alert('Браузер не умеет распознавать речь. Нужен Chrome.'); return; }
    const p = await micPermission();
    if (p !== 'granted') { alert('Нет доступа к микрофону (' + p + ')'); return; }
    v.startListen(); v.openDialog(120);
    off.current = v.on('final', t => onText(t));
    setOn(true);
  };
  return <button onClick={toggle} title={on ? 'Стоп (идёт диктовка)' : 'Диктовать голосом'}
    className={`size-11 grid place-items-center rounded-xl border transition shrink-0 ${on ? 'bg-rose-500 text-white border-rose-500 animate-pulse' : 'border-zinc-200 dark:border-white/10 hover:border-blue-500 ' + className}`}>
    <Mic size={17} />
  </button>;
}
