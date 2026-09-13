'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Search } from 'lucide-react';
import { supaBrowser, isCloud } from '@/lib/supabase/client';
import { useStore } from '@/lib/store';
import { useOnlineList } from '@/lib/realtime';
import { Avatar, Empty } from '@/components/ui/primitives';
import type { Profile } from '@/lib/supabase/types';

export default function UsersPage() {
  const me = useStore(s => s.me);
  const cloud = isCloud() && me && !me.guest;
  const [list, setList] = useState<Profile[]>([]);
  const [q, setQ] = useState('');
  const [online, setOnline] = useState<string[]>([]);
  const [showOnline, setShowOnline] = useState(false);
  const onOnline = useCallback((ids: string[]) => setOnline(ids), []);
  useOnlineList(onOnline);
  useEffect(() => {
    if (!cloud) return;
    supaBrowser().from('profiles').select('*').order('last_seen', { ascending: false }).limit(100).then(({ data }) => setList((data || []) as never[]));
  }, [cloud]);
  const f = q.toLowerCase();
  const shown = list.filter(p => (!f || p.name.toLowerCase().includes(f)) && (!showOnline || online.includes(p.id)));
  if (!cloud) return <div className="max-w-2xl mx-auto"><h1 className="font-display font-bold text-xl mb-3">Люди</h1><Empty icon="👥" title="Гостевой режим" sub="Войди через Supabase-облако — и увидишь всех пользователей сети" /></div>;
  return <div className="max-w-2xl mx-auto">
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <h1 className="font-display font-bold text-xl">Люди</h1>
      <span className="text-xs font-bold text-emerald-500">🟢 онлайн: {online.length}</span>
      <div className="ml-auto flex gap-2">
        <button onClick={() => setShowOnline(!showOnline)} className={`text-xs font-bold px-3 py-1.5 rounded-full border transition ${showOnline ? 'bg-emerald-500 text-white border-emerald-500' : 'border-zinc-200 dark:border-white/10'}`}>Только онлайн</button>
        <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-zinc-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск…" className="h-9 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 pl-8 pr-3 text-sm outline-none w-40" /></div>
      </div>
    </div>
    <div className="flex flex-col gap-2">
      {shown.map(p => <Link key={p.id} href={`/profile?id=${p.id}`} className="glass rounded-2xl p-3 flex items-center gap-3 card-hover">
        <div className="relative"><Avatar src={p.avatar_url} name={p.name} size={44} />{online.includes(p.id) && <span className="absolute bottom-0 right-0 size-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-950" />}</div>
        <div className="min-w-0 flex-1"><div className="font-bold text-sm flex items-center gap-1">{p.name} {p.verified && <BadgeCheck size={15} className="text-blue-500" />} {p.role === 'admin' && <span className="text-[10px] bg-amber-500/15 text-amber-500 px-1.5 py-0.5 rounded font-bold">ADMIN</span>}</div>
          <div className="text-xs text-zinc-500 truncate">{p.status || p.bio || '—'}</div></div>
      </Link>)}
      {shown.length === 0 && <Empty icon="🔍" title="Никого не нашёл" />}
    </div>
  </div>;
}
