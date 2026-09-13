'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Send, Minus } from 'lucide-react';
import { useStore } from '@/lib/store';
import { usePathname, useRouter } from 'next/navigation';
import { copilotStream } from '@/lib/hybrid/ai';
import ReactMarkdown from 'react-markdown';

interface Msg { role: 'user' | 'assistant'; text: string }

const POS_K = 'legion-copilot-pos-v1';
function loadPos(): { x: number; y: number } | null {
  try {
    const p = JSON.parse(localStorage.getItem(POS_K) || 'null');
    return p && typeof p.x === 'number' ? p : null;
  } catch { return null; }
}

export function CopilotPanel() {
  const open = useStore(s => s.copilotOpen);
  const setOpen = useStore(s => s.setCopilot);
  const toggleTheme = useStore(s => s.toggleTheme);
  const path = usePathname();
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [mini, setMini] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => { if (open && !pos) setPos(loadPos()); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottom.current?.scrollIntoView(); }, [msgs.length, busy, mini]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    const hist: Msg[] = [...msgs, { role: 'user' as const, text: q }];
    setMsgs(hist);
    setBusy(true);
    let key = '';
    try { key = localStorage.getItem('legion-agnes-key') || ''; } catch {}
    let acc = '';
    setMsgs([...hist, { role: 'assistant', text: '' }]);
    try {
      for await (const chunk of copilotStream(hist, path, h => router.push(h), () => toggleTheme(), key || undefined)) {
        acc += chunk;
        const snap = acc;
        setMsgs(m => { const c = [...m]; c[c.length - 1] = { role: 'assistant', text: snap }; return c; });
      }
    } catch {
      setMsgs(m => { const c = [...m]; c[c.length - 1] = { role: 'assistant', text: '⚠ Ошибка (нужен Agnes-ключ)' }; return c; });
    }
    setBusy(false);
  };

  const onDragStart = (e: React.PointerEvent) => {
    const el = (e.target as HTMLElement).closest('[data-copilot-win]') as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const w = Math.min(400, window.innerWidth - 16);
    const h = mini ? 52 : Math.min(560, window.innerHeight - 16);
    const x = Math.max(8, Math.min(window.innerWidth - w - 8, e.clientX - drag.current.dx));
    const y = Math.max(8, Math.min(window.innerHeight - h - 8, e.clientY - drag.current.dy));
    setPos({ x, y });
  };
  const onDragEnd = () => {
    drag.current = null;
    try { if (pos) localStorage.setItem(POS_K, JSON.stringify(pos)); } catch {}
  };

  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { right: 16, bottom: 88 };

  return <AnimatePresence>
    {open && <motion.div data-copilot-win initial={{ opacity: 0, scale: 0.92, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: 16 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      style={{ ...style, width: 'min(400px, calc(100vw - 16px))' }}
      className="fixed z-[65] glass rounded-3xl shadow-2xl border border-white/20 flex flex-col overflow-hidden">
      <div onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}
        className="flex items-center gap-2 px-4 py-3 border-b border-zinc-200 dark:border-white/10 cursor-grab active:cursor-grabbing select-none touch-none shrink-0">
        <b className="text-sm">✨ Copilot</b>
        <span className="text-[10px] text-zinc-400 font-bold hidden sm:inline">тяни меня · вижу экран</span>
        <div className="ml-auto flex gap-1">
          <button onClick={() => setMini(!mini)} title={mini ? 'Развернуть' : 'Свернуть'} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10"><Minus size={16} /></button>
          <button onClick={() => setOpen(false)} title="Закрыть" className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10"><X size={16} /></button>
        </div>
      </div>
      {!mini && <>
        <div className="overflow-y-auto p-3 flex flex-col gap-2 chat-scroll" style={{ height: 'min(380px, calc(100vh - 260px))', minHeight: 200 }}>
          {msgs.length === 0 && <div className="text-sm text-zinc-500 font-medium">Привет! Я вижу, где ты ({path}). Окно можно таскать за шапку — экран всегда виден. Могу объяснить, помочь с постом или отвести куда скажешь.</div>}
          {msgs.map((m, i) => <div key={i} className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed prose dark:prose-invert prose-sm ${m.role === 'user' ? 'self-end bg-blue-600 text-white' : 'self-start bg-zinc-100 dark:bg-white/8'}`}>
            <ReactMarkdown>{m.text || '…'}</ReactMarkdown>
          </div>)}
          {busy && <div className="text-xs text-zinc-500 font-bold animate-pulse">◌ Думаю…</div>}
          <div ref={bottom} />
        </div>
        <div className="p-3 border-t border-zinc-200 dark:border-white/10 flex gap-2 shrink-0">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Спроси…" className="flex-1 h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" />
          <button onClick={send} disabled={busy} className="size-10 grid place-items-center rounded-xl bg-blue-600 text-white disabled:opacity-50"><Send size={16} /></button>
        </div>
      </>}
    </motion.div>}
  </AnimatePresence>;
}
