'use client';
import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Send } from 'lucide-react';
import { useStore } from '@/lib/store';
import { usePathname, useRouter } from 'next/navigation';
import { copilotStream } from '@/lib/hybrid/ai';
import ReactMarkdown from 'react-markdown';

interface Msg { role: 'user' | 'assistant'; text: string }

export function CopilotPanel() {
  const open = useStore(s => s.copilotOpen);
  const setOpen = useStore(s => s.setCopilot);
  const toggleTheme = useStore(s => s.toggleTheme);
  const path = usePathname();
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

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
        bottom.current?.scrollIntoView();
      }
    } catch {
      setMsgs(m => { const c = [...m]; c[c.length - 1] = { role: 'assistant', text: '⚠ Ошибка (нужен Agnes-ключ)' }; return c; });
    }
    setBusy(false);
  };

  return <AnimatePresence>
    {open && <motion.div initial={{ x: 380 }} animate={{ x: 0 }} exit={{ x: 380 }} transition={{ type: 'spring', stiffness: 380, damping: 40 }} className="fixed top-0 right-0 bottom-0 z-[65] w-full max-w-sm glass border-y-0 border-r-0 shadow-2xl flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-200 dark:border-white/10">
        <b className="text-sm">✨ Copilot-помощник</b>
        <span className="text-[10px] text-zinc-400 font-bold">знает страницу · умеет ходить</span>
        <button onClick={() => setOpen(false)} className="ml-auto p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10"><X size={16} /></button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2 chat-scroll">
        {msgs.length === 0 && <div className="text-sm text-zinc-500 font-medium">Привет! Я вижу, где ты ({path}). Могу объяснить страницу, помочь с постом или отвести куда скажешь.</div>}
        {msgs.map((m, i) => <div key={i} className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed prose dark:prose-invert prose-sm ${m.role === 'user' ? 'self-end bg-blue-600 text-white' : 'self-start bg-zinc-100 dark:bg-white/8'}`}>
          <ReactMarkdown>{m.text || '…'}</ReactMarkdown>
        </div>)}
        {busy && <div className="text-xs text-zinc-500 font-bold animate-pulse">◌ Думаю…</div>}
        <div ref={bottom} />
      </div>
      <div className="p-3 border-t border-zinc-200 dark:border-white/10 flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Спроси…" className="flex-1 h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" />
        <button onClick={send} disabled={busy} className="size-10 grid place-items-center rounded-xl bg-blue-600 text-white disabled:opacity-50"><Send size={16} /></button>
      </div>
    </motion.div>}
  </AnimatePresence>;
}
