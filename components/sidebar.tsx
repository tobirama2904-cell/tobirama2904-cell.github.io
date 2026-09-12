'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { MessageSquare, Newspaper, MessagesSquare, Mic, Clapperboard, Brain, Zap, BarChart3, Users, ShieldCheck, Sun, Moon, Command, LogOut, Bell, Sparkles } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Avatar, Badge } from './ui/primitives';
import { Tip } from './ui/overlays';
import { supaBrowser } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import { isCloud } from '@/lib/supabase/client';

const NAV = [
  { href: '/chat', icon: MessageSquare, label: 'AI Чат', k: '1' },
  { href: '/feed', icon: Newspaper, label: 'Лента', k: '2' },
  { href: '/messages', icon: MessagesSquare, label: 'Мессенджер', k: '3' },
  { href: '/voice', icon: Mic, label: 'Голос', k: '4' },
  { href: '/studio', icon: Clapperboard, label: 'Студия', k: '5' },
  { href: '/memory', icon: Brain, label: 'Память', k: '6' },
  { href: '/missions', icon: Zap, label: 'Легион', k: '7' },
  { href: '/stats', icon: BarChart3, label: 'Статистика', k: '8' },
  { href: '/users', icon: Users, label: 'Люди', k: '9' },
  { href: '/bots', icon: Sparkles, label: 'Боты', k: '0' },
];
export function Sidebar() {
  const path = usePathname(), router = useRouter();
  const { me, theme, toggleTheme, setCmdk, setCopilot, cloud } = useStore();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!me || me.guest || !isCloud()) return;
    const sb = supaBrowser();
    sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', me.id).eq('read', false).then(({ count }) => setUnread(count || 0));
    const ch = sb.channel('notif:' + me.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${me.id}` }, () => setUnread(u => u + 1)).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [me]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdk(true); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [setCmdk]);
  return <>
    {/* desktop */}
    <aside className="hidden lg:flex w-64 shrink-0 flex-col gap-1 p-3 border-r border-zinc-200 dark:border-white/10 bg-white/60 dark:bg-black/30 backdrop-blur-2xl h-screen sticky top-0">
      <Link href="/" className="flex items-center gap-2.5 px-2 py-3">
        <div className="size-9 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-400 grid place-items-center text-white font-display font-bold shadow-lg shadow-blue-600/30">◈</div>
        <div className="leading-none"><div className="font-display font-bold tracking-widest text-[15px]">LEGION</div><div className="text-[10px] text-zinc-500 font-bold tracking-[.2em]">SOCIAL · v19</div></div>
        {!cloud && <Badge className="ml-auto">гость</Badge>}
      </Link>
      <nav className="flex flex-col gap-0.5 mt-1">
        {NAV.map(n => {
          const active = path === n.href;
          return <Link key={n.href} href={n.href} className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? 'text-white' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5'}`}>
            {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 shadow-lg shadow-blue-600/30" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <n.icon size={18} className="relative z-10" />
            <span className="relative z-10">{n.label}</span>
            {n.href === '/messages' && unread > 0 && <span className="relative z-10 ml-auto text-[11px] bg-rose-500 text-white rounded-full min-w-5 h-5 grid place-items-center px-1 font-bold">{unread}</span>}
          </Link>;
        })}
        {me?.role === 'admin' && <Link href="/admin" className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${path === '/admin' ? 'text-white' : 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'}`}>
          {path === '/admin' && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <ShieldCheck size={18} className="relative z-10" /><span className="relative z-10">Админка</span>
        </Link>}
      </nav>
      <div className="mt-auto flex flex-col gap-2">
        <button onClick={() => setCopilot(true)} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold bg-gradient-to-br from-violet-600/15 to-blue-600/15 border border-violet-500/20 hover:border-violet-500/50 transition text-left">
          <Sparkles size={18} className="text-violet-500" /> Copilot-помощник
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => setCmdk(true)} className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-zinc-500 border border-zinc-200 dark:border-white/10 hover:border-blue-500 transition"><Command size={15} /> Поиск… <kbd className="ml-auto text-[10px] bg-zinc-100 dark:bg-white/10 rounded px-1.5 py-0.5 font-bold">⌘K</kbd></button>
          <Tip label="Сменить тему"><button onClick={toggleTheme} className="size-10 grid place-items-center rounded-xl border border-zinc-200 dark:border-white/10 hover:border-blue-500 transition">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button></Tip>
        </div>
        {me ? <div className="flex items-center gap-2.5 rounded-xl p-2 border border-zinc-200 dark:border-white/10">
          <Avatar src={me.avatar} name={me.name} size={34} />
          <div className="min-w-0 flex-1"><div className="text-sm font-bold truncate">{me.name}</div><div className="text-[11px] text-zinc-500 truncate">{me.guest ? 'Гость · войди для сети' : me.email}</div></div>
          {!me.guest && <Tip label="Выйти"><button onClick={async () => { await supaBrowser().auth.signOut(); router.push('/'); }} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500"><LogOut size={15} /></button></Tip>}
        </div> : <Link href="/login" className="text-center rounded-xl py-2.5 text-sm font-bold bg-blue-600 text-white shadow-lg shadow-blue-600/25 hover:bg-blue-500 transition">Войти</Link>}
      </div>
    </aside>
    {/* mobile bottom bar */}
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-zinc-200 dark:border-white/10 px-2 pt-1.5 pb-[max(.5rem,env(safe-area-inset-bottom))] flex justify-around">
      {NAV.slice(0, 5).map(n => {
        const active = path === n.href;
        return <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-[10px] font-bold ${active ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400'}`}>
          <n.icon size={20} />{n.label}
        </Link>;
      })}
    </nav>
  </>;
}
export function NotifBell() {
  const me = useStore(s => s.me);
  const [items, setItems] = useState<{ id: string; title: string; body: string; read: boolean; created_at: string }[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!me || me.guest || !isCloud()) return;
    supaBrowser().from('notifications').select('*').eq('user_id', me.id).order('created_at', { ascending: false }).limit(15).then(({ data }) => setItems((data || []) as never[]));
  }, [me, open]);
  const unread = items.filter(i => !i.read).length;
  if (!me || me.guest) return null;
  return <div className="relative">
    <button onClick={() => setOpen(!open)} className="relative size-10 grid place-items-center rounded-xl border border-zinc-200 dark:border-white/10 hover:border-blue-500 transition">
      <Bell size={17} />{unread > 0 && <span className="absolute -top-1 -right-1 text-[10px] bg-rose-500 text-white rounded-full min-w-5 h-5 grid place-items-center px-1 font-bold">{unread}</span>}
    </button>
    {open && <div className="absolute right-0 top-12 w-80 max-h-96 overflow-y-auto rounded-2xl glass shadow-2xl p-2 z-50">
      <div className="flex items-center justify-between px-2 py-1.5"><b className="text-sm">Уведомления</b>
        <button className="text-xs text-blue-500 font-bold" onClick={async () => { await supaBrowser().from('notifications').update({ read: true }).eq('user_id', me.id); setItems(items.map(i => ({ ...i, read: true }))); }}>Прочесть все</button></div>
      {items.length === 0 && <div className="text-sm text-zinc-500 text-center py-6">Пока тихо</div>}
      {items.map(n => <div key={n.id} className={`rounded-xl px-3 py-2.5 mb-1 ${n.read ? '' : 'bg-blue-500/10'}`}>
        <div className="text-sm font-bold">{n.title}</div><div className="text-xs text-zinc-500">{n.body}</div>
      </div>)}
    </div>}
  </div>;
}
