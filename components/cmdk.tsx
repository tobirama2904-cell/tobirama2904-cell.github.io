'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquare, Newspaper, MessagesSquare, Mic, Clapperboard, Brain, Zap, BarChart3, Users, ShieldCheck, Sun, Moon, LogIn, UserPlus, Sparkles, Home } from 'lucide-react';
import { useStore } from '@/lib/store';

export function Cmdk() {
  const open = useStore(s => s.cmdkOpen);
  const setOpen = useStore(s => s.setCmdk);
  const toggleTheme = useStore(s => s.toggleTheme);
  const setCopilot = useStore(s => s.setCopilot);
  const me = useStore(s => s.me);
  const router = useRouter();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const items = useMemo(() => {
    const go = (href: string, label: string) => ({ icon: Home, label, hint: 'страница', run: () => { router.push(href); } });
    const all = [
      { ...go('/chat', 'AI Чат с Легионом'), icon: MessageSquare },
      { ...go('/feed', 'Лента'), icon: Newspaper },
      { ...go('/messages', 'Мессенджер'), icon: MessagesSquare },
      { ...go('/voice', 'Голосовое управление'), icon: Mic },
      { ...go('/studio', 'Студия файлов'), icon: Clapperboard },
      { ...go('/memory', 'Память'), icon: Brain },
      { ...go('/missions', 'Легион задач'), icon: Zap },
      { ...go('/stats', 'Статистика'), icon: BarChart3 },
      { ...go('/users', 'Люди'), icon: Users },
      { ...go('/bots', 'AI-Боты'), icon: Sparkles },
      { icon: Sun, label: 'Сменить тему', hint: 'оформление', run: toggleTheme },
      { icon: Sparkles, label: 'Copilot-помощник', hint: 'AI', run: () => setCopilot(true) },
      ...(me?.role === 'admin' ? [{ ...go('/admin', 'Админка'), icon: ShieldCheck }] : []),
      ...(!me || me.guest ? [{ ...go('/login', 'Войти'), icon: LogIn }, { ...go('/register', 'Регистрация'), icon: UserPlus }] : []),
    ];
    const f = q.toLowerCase();
    return f ? all.filter(i => i.label.toLowerCase().includes(f)) : all;
  }, [q, router, toggleTheme, setCopilot, me]);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { if (open) { setQ(''); setTimeout(() => inputRef.current?.focus(), 40); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(items.length - 1, s + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
      else if (e.key === 'Enter') { items[sel]?.run(); setOpen(false); }
      else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, items, sel, setOpen]);
  return <AnimatePresence>
    {open && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex justify-center pt-[12vh] px-4" onClick={() => setOpen(false)}>
      <motion.div initial={{ y: -18, scale: .97 }} animate={{ y: 0, scale: 1 }} exit={{ y: -12, scale: .97 }} transition={{ type: 'spring', stiffness: 500, damping: 36 }} className="w-full max-w-xl h-fit rounded-2xl glass shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Куда? Действие, страница, человек…" className="w-full bg-transparent px-5 py-4 outline-none text-[15px] font-medium border-b border-zinc-200 dark:border-white/10" />
        <div className="max-h-80 overflow-y-auto p-2">
          {items.map((it, i) => <button key={it.label} onMouseEnter={() => setSel(i)} onClick={() => { it.run(); setOpen(false); }} className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-left transition ${i === sel ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-zinc-100 dark:hover:bg-white/5'}`}>
            <it.icon size={17} /><span className="flex-1">{it.label}</span><span className={`text-[11px] ${i === sel ? 'text-white/70' : 'text-zinc-400'}`}>{it.hint}</span>
          </button>)}
          {items.length === 0 && <div className="text-center text-sm text-zinc-500 py-8">Ничего не найдено</div>}
        </div>
      </motion.div>
    </motion.div>}
  </AnimatePresence>;
}
