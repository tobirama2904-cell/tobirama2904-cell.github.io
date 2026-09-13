'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Newspaper, MessagesSquare, Mic, Clapperboard, Brain, Zap, BarChart3, Users, ShieldCheck, Sun, Moon, Command, LogOut, Bell, Sparkles, Plus, User, PlaySquare, X, Home } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Avatar, Badge } from './ui/primitives';
import { Tip } from './ui/overlays';
import { useEffect, useState } from 'react';
import { signOut } from '@/lib/hybrid/identity';
import { listNotifs, unreadCount, markAllRead, onPush } from '@/lib/hybrid/notify';
import type { Notification as NotifT } from '@/lib/supabase/types';

const NAV = [
  { href: '/chat', icon: MessageSquare, label: 'AI Чат', k: '1' },
  { href: '/feed', icon: Newspaper, label: 'Лента', k: '2' },
  { href: '/messages', icon: MessagesSquare, label: 'Мессенджер', k: '3' },
  { href: '/clips', icon: PlaySquare, label: 'Клипы', k: '4' },
  { href: '/create', icon: Plus, label: 'Создать', k: '5' },
  { href: '/voice', icon: Mic, label: 'Голос', k: '6' },
  { href: '/studio', icon: Clapperboard, label: 'Студия', k: '7' },
  { href: '/memory', icon: Brain, label: 'Память', k: '8' },
  { href: '/missions', icon: Zap, label: 'Легион', k: '9' },
  { href: '/stats', icon: BarChart3, label: 'Статистика', k: '0' },
  { href: '/users', icon: Users, label: 'Люди', k: '' },
  { href: '/bots', icon: Sparkles, label: 'Боты', k: '' },
];
const MOBILE_TABS = ['/feed', '/messages', '/create', '/clips'];

export function Sidebar() {
  const path = usePathname(), router = useRouter();
  const { me, theme, toggleTheme, setCmdk, setCopilot, cloud } = useStore();
  const [unread, setUnread] = useState(0);
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    if (!me || me.guest) { setUnread(0); return; }
    setUnread(unreadCount(me.id));
    return onPush(n => { if (n.user_id === me.id) setUnread(unreadCount(me.id)); });
  }, [me]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdk(true); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [setCmdk]);
  const logout = async () => { signOut(); router.push('/'); };
  const profileHref = me && !me.guest ? `/profile?id=${me.id}` : '/login';
  return <>
    {/* desktop */}
    <aside className="hidden lg:flex w-64 shrink-0 flex-col gap-1 p-3 border-r border-zinc-200 dark:border-white/10 bg-white/60 dark:bg-black/30 backdrop-blur-2xl h-screen sticky top-0 overflow-y-auto">
      <Link href="/" className="flex items-center gap-2.5 px-2 py-3">
        <div className="size-9 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-400 grid place-items-center text-white font-display font-bold shadow-lg shadow-blue-600/30">◈</div>
        <div className="leading-none"><div className="font-display font-bold tracking-widest text-[15px]">LEGION</div><div className="text-[10px] text-zinc-500 font-bold tracking-[.2em]">SOCIAL · v22</div></div>
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
        <Link href={profileHref} className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${path === '/profile' ? 'text-white' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5'}`}>
          {path === '/profile' && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 shadow-lg shadow-blue-600/30" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <User size={18} className="relative z-10" /><span className="relative z-10">Профиль</span>
        </Link>
        {me?.role === 'admin' && <Link href="/admin" className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${path === '/admin' ? 'text-white' : 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'}`}>
          {path === '/admin' && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <ShieldCheck size={18} className="relative z-10" /><span className="relative z-10">Админка</span>
        </Link>}
      </nav>
      <div className="mt-auto flex flex-col gap-2 pt-3">
        <button onClick={() => setCopilot(true)} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold bg-gradient-to-br from-violet-600/15 to-blue-600/15 border border-violet-500/20 hover:border-violet-500/50 transition text-left">
          <Sparkles size={18} className="text-violet-500" /> Copilot-помощник
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => setCmdk(true)} className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-zinc-500 border border-zinc-200 dark:border-white/10 hover:border-blue-500 transition"><Command size={15} /> Поиск… <kbd className="ml-auto text-[10px] bg-zinc-100 dark:bg-white/10 rounded px-1.5 py-0.5 font-bold">⌘K</kbd></button>
          <Tip label="Сменить тему"><button onClick={toggleTheme} className="size-10 grid place-items-center rounded-xl border border-zinc-200 dark:border-white/10 hover:border-blue-500 transition">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button></Tip>
        </div>
        {me ? <div className="flex items-center gap-2.5 rounded-xl p-2 border border-zinc-200 dark:border-white/10">
          <Link href={profileHref}><Avatar src={me.avatar} name={me.name} size={34} /></Link>
          <div className="min-w-0 flex-1"><div className="text-sm font-bold truncate">{me.name}</div><div className="text-[11px] text-zinc-500 truncate">{me.guest ? 'Гость · войди для сети' : me.email}</div></div>
          {!me.guest && <Tip label="Выйти"><button onClick={logout} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500"><LogOut size={15} /></button></Tip>}
        </div> : <Link href="/login" className="text-center rounded-xl py-2.5 text-sm font-bold bg-blue-600 text-white shadow-lg shadow-blue-600/25 hover:bg-blue-500 transition">Войти</Link>}
      </div>
    </aside>
    {/* mobile bottom bar */}
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass border-x-0 border-b-0 border-t border-zinc-200 dark:border-white/10 px-1 pt-1.5 pb-[max(.5rem,env(safe-area-inset-bottom))] flex justify-around items-end">
      {MOBILE_TABS.slice(0, 2).map(href => {
        const n = NAV.find(x => x.href === href)!;
        const active = path === n.href;
        return <Link key={n.href} href={n.href} className={`relative flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl text-[10px] font-bold ${active ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400'}`}>
          <n.icon size={22} />{n.label}
          {n.href === '/messages' && unread > 0 && <span className="absolute top-0 right-2 text-[10px] bg-rose-500 text-white rounded-full min-w-5 h-5 grid place-items-center px-1 font-bold">{unread}</span>}
        </Link>;
      })}
      <Link href="/create" className="flex flex-col items-center gap-0.5 px-4 -mt-6">
        <span className={`size-13 w-[52px] h-[52px] grid place-items-center rounded-2xl text-white shadow-xl shadow-blue-600/30 ${path === '/create' ? 'bg-blue-500' : 'bg-gradient-to-br from-blue-600 to-cyan-500'}`}><Plus size={24} /></span>
        <span className={`text-[10px] font-bold ${path === '/create' ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400'}`}>Создать</span>
      </Link>
      {MOBILE_TABS.slice(2).filter(h => h !== '/create').map(href => {
        const n = NAV.find(x => x.href === href)!;
        const active = path === n.href;
        return <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl text-[10px] font-bold ${active ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400'}`}>
          <n.icon size={22} />{n.label}
        </Link>;
      })}
      <button onClick={() => setSheet(true)} className="flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl text-[10px] font-bold text-zinc-400">
        <span className="grid grid-cols-2 gap-[3px] p-[3px]">{[0, 1, 2, 3].map(i => <span key={i} className="size-[7px] rounded-[2px] bg-current" />)}</span>Ещё
      </button>
    </nav>
    {/* mobile "more" sheet */}
    <AnimatePresence>
      {sheet && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="lg:hidden fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end" onClick={() => setSheet(false)}>
        <motion.div initial={{ y: 120 }} animate={{ y: 0 }} exit={{ y: 120 }} transition={{ type: 'spring', stiffness: 420, damping: 38 }} className="w-full rounded-t-3xl glass border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center mb-3">
            <button onClick={() => { setSheet(false); setCmdk(true); }} className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-zinc-500 border border-zinc-200 dark:border-white/10"><Command size={15} /> Поиск…</button>
            <button onClick={toggleTheme} className="ml-2 size-10 grid place-items-center rounded-xl border border-zinc-200 dark:border-white/10">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
            <button onClick={() => setSheet(false)} className="ml-2 size-10 grid place-items-center rounded-xl border border-zinc-200 dark:border-white/10"><X size={17} /></button>
          </div>
          {me && <Link href={profileHref} onClick={() => setSheet(false)} className="flex items-center gap-2.5 rounded-2xl p-2.5 border border-zinc-200 dark:border-white/10 mb-3">
            <Avatar src={me.avatar} name={me.name} size={40} />
            <div className="min-w-0 flex-1"><div className="text-sm font-bold truncate">{me.name}</div><div className="text-[11px] text-zinc-500 truncate">{me.guest ? 'Гость · нажми чтобы войти' : me.email}</div></div>
            {!me.guest && <span onClick={e => { e.preventDefault(); logout(); setSheet(false); }} className="p-2 rounded-lg text-zinc-500"><LogOut size={16} /></span>}
          </Link>}
          <div className="grid grid-cols-4 gap-2">
            {[...NAV, { href: profileHref, icon: User, label: 'Профиль', k: '' }].map(n => {
              const active = path === n.href;
              return <Link key={n.href + n.label} href={n.href} onClick={() => setSheet(false)} className={`flex flex-col items-center gap-1.5 rounded-2xl py-3 text-[11px] font-bold border transition ${active ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-500/5' : 'border-zinc-200 dark:border-white/10 text-zinc-500'}`}>
                <n.icon size={21} />{n.label}
              </Link>;
            })}
            {me?.role === 'admin' && <Link href="/admin" onClick={() => setSheet(false)} className={`flex flex-col items-center gap-1.5 rounded-2xl py-3 text-[11px] font-bold border transition ${path === '/admin' ? 'border-amber-500 text-amber-500 bg-amber-500/5' : 'border-amber-500/40 text-amber-600 dark:text-amber-400'}`}>
              <ShieldCheck size={21} />Админка
            </Link>}
            <button onClick={() => { setSheet(false); setCopilot(true); }} className="flex flex-col items-center gap-1.5 rounded-2xl py-3 text-[11px] font-bold border border-violet-500/30 text-violet-500">
              <Sparkles size={21} />Copilot
            </button>
            <Link href="/" onClick={() => setSheet(false)} className="flex flex-col items-center gap-1.5 rounded-2xl py-3 text-[11px] font-bold border border-zinc-200 dark:border-white/10 text-zinc-500">
              <Home size={21} />Главная
            </Link>
          </div>
          <div className="text-center text-[10px] font-bold text-zinc-400 mt-3">LEGION v22 · всё бесплатно · обнови страницу, если что-то старое</div>
        </motion.div>
      </motion.div>}
    </AnimatePresence>
  </>;
}
export function NotifBell() {
  const me = useStore(s => s.me);
  const [items, setItems] = useState<NotifT[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!me || me.guest) { setItems([]); return; }
    setItems(listNotifs(me.id));
    return onPush(n => { if (n.user_id === me.id) setItems(listNotifs(me.id)); });
  }, [me]);
  const unread = items.filter(i => !i.read).length;
  if (!me || me.guest) return null;
  return <div className="relative">
    <button onClick={() => { setOpen(!open); if (!open && me) setItems(listNotifs(me.id)); }} className="relative size-10 grid place-items-center rounded-xl border border-zinc-200 dark:border-white/10 hover:border-blue-500 transition">
      <Bell size={17} />{unread > 0 && <span className="absolute -top-1 -right-1 text-[10px] bg-rose-500 text-white rounded-full min-w-5 h-5 grid place-items-center px-1 font-bold">{unread}</span>}
    </button>
    {open && <div className="absolute right-0 top-12 w-80 max-w-[85vw] max-h-96 overflow-y-auto rounded-2xl glass shadow-2xl p-2 z-50">
      <div className="flex items-center justify-between px-2 py-1.5"><b className="text-sm">Уведомления</b>
        <button className="text-xs text-blue-500 font-bold" onClick={() => { if (me) { markAllRead(me.id); setItems(listNotifs(me.id)); } }}>Прочесть все</button></div>
      {items.length === 0 && <div className="text-sm text-zinc-500 text-center py-6">Пока тихо</div>}
      {items.map(n => <Link key={n.id} href={n.link || '#'} onClick={() => setOpen(false)} className={`block rounded-xl px-3 py-2.5 mb-1 ${n.read ? '' : 'bg-blue-500/10'}`}>
        <div className="text-sm font-bold">{n.title}</div><div className="text-xs text-zinc-500">{n.body}</div>
      </Link>)}
    </div>}
  </div>;
}
