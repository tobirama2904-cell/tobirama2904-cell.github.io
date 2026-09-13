'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Search, UserPlus, Link2, MessageSquare } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useOnlineList } from '@/lib/realtime';
import { Avatar, Empty, Button } from '@/components/ui/primitives';
import { directory, searchProfiles, resolveAccount, getProfile, setFollow, getFollowing } from '@/lib/hybrid/social';
import type { Profile } from '@/lib/supabase/types';

export default function UsersPage() {
  const me = useStore(s => s.me);
  const logged = me && !me.guest;
  const router = useRouter();
  const [list, setList] = useState<Profile[]>([]);
  const [q, setQ] = useState('');
  const [sq, setSq] = useState('');
  const [sres, setSres] = useState<Profile[] | null>(null);
  const [online, setOnline] = useState<string[]>([]);
  const [showOnline, setShowOnline] = useState(false);
  const [addId, setAddId] = useState('');
  const [addErr, setAddErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState<string[]>([]);
  const onOnline = useCallback((ids: string[]) => setOnline(ids), []);
  useOnlineList(onOnline);

  useEffect(() => {
    if (!logged) { setLoading(false); return; }
    setLoading(true);
    Promise.all([directory(80).catch(() => []), getFollowing(me.id).catch(() => [])]).then(([d, f]) => {
      setList(d.filter(p => p.id !== me.id));
      setFollowing(f);
      setLoading(false);
    });
  }, [logged, me]);
  useEffect(() => {
    if (sq.trim().length < 2) { setSres(null); return; }
    const t = setTimeout(() => {
      searchProfiles(sq.trim()).then(r => setSres(r)).catch(() => setSres([]));
    }, 500);
    return () => clearTimeout(t);
  }, [sq]);

  const addByAccount = async () => {
    const v = addId.trim();
    if (!v) return;
    setAddErr('');
    const pk = await resolveAccount(v).catch(() => null);
    if (!pk) { setAddErr('Не нашёл аккаунт (npub1… / hex / name@domain)'); return; }
    const p = await getProfile(pk).catch(() => null);
    if (!p || (!p.name || p.name.startsWith('nostr:'))) {
      // still allow opening: maybe brand-new account
      if (!p) { setAddErr('Профиль не найден на релеях'); return; }
    }
    setAddId('');
    router.push('/profile?id=' + pk);
  };
  const toggleFollow = async (p: Profile) => {
    if (!logged) return;
    const on = !following.includes(p.id);
    await setFollow(p.id, on).catch(() => {});
    setFollowing(on ? [...following, p.id] : following.filter(x => x !== p.id));
  };
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/messages?dm=${me!.id}`); alert('Ссылка-приглашение скопирована!'); } catch {}
  };

  if (!me) return <div className="max-w-2xl mx-auto"><Empty icon="…" title="Загрузка…" /></div>;
  if (!logged) return <div className="max-w-2xl mx-auto"><h1 className="font-display font-bold text-xl mb-3">Люди</h1><Empty icon="👥" title="Войди, чтобы видеть людей" sub="Здесь живут настоящие аккаунты сети LEGION" /></div>;
  const base = sres !== null ? sres : list;
  const f = q.toLowerCase();
  const shown = base.filter(p => (!f || (p.name + p.id).toLowerCase().includes(f)) && (!showOnline || online.includes(p.id)));
  return <div className="max-w-2xl mx-auto">
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <h1 className="font-display font-bold text-xl">Люди</h1>
      <span className="text-xs font-bold text-emerald-500">🟢 онлайн: {online.length}</span>
      <div className="ml-auto flex gap-2">
        <button onClick={() => setShowOnline(!showOnline)} className={`text-xs font-bold px-3 py-1.5 rounded-full border transition ${showOnline ? 'bg-emerald-500 text-white border-emerald-500' : 'border-zinc-200 dark:border-white/10'}`}>Только онлайн</button>
        <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-zinc-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Фильтр…" className="h-9 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 pl-8 pr-3 text-sm outline-none w-32" /></div>
      </div>
    </div>
    <div className="glass rounded-2xl p-3 mb-3">
      <div className="text-[11px] font-bold text-zinc-400 mb-1.5">🔍 ГЛОБАЛЬНЫЙ ПОИСК ПО СЕТИ</div>
      <input value={sq} onChange={e => setSq(e.target.value)} placeholder="Имя или npub… (от 2 букв)" className="w-full h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3.5 text-sm outline-none" />
      {sres !== null && <div className="text-xs text-zinc-500 mt-1">Найдено: {sres.length} {sq.trim().startsWith('npub') || sq.includes('@') ? '' : ''}</div>}
    </div>
    <div className="glass rounded-2xl p-3 mb-3">
      <div className="text-[11px] font-bold text-zinc-400 mb-1.5">➕ ДОБАВИТЬ ПО АККАУНТУ</div>
      <div className="flex gap-2">
        <input value={addId} onChange={e => setAddId(e.target.value)} onKeyDown={e => e.key === 'Enter' && addByAccount()} placeholder="npub1… / hex / name@domain" className="flex-1 h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3.5 text-sm outline-none font-mono" />
        <Button size="sm" onClick={addByAccount}><UserPlus size={14} /></Button>
        <Button size="sm" variant="outline" title="Моя ссылка-приглашение" onClick={copyInvite}><Link2 size={14} /></Button>
      </div>
      {addErr && <div className="text-xs font-bold text-rose-500 mt-1">{addErr}</div>}
    </div>
    <div className="flex flex-col gap-2 pb-10">
      {loading && <div className="text-sm text-zinc-500 text-center py-4 animate-pulse">Загружаю людей с релеев…</div>}
      {!loading && shown.map(p => <div key={p.id} className="glass rounded-2xl p-3 flex items-center gap-3 card-hover">
        <Link href={`/profile?id=${p.id}`} className="relative shrink-0"><Avatar src={p.avatar_url} name={p.name} size={44} />{online.includes(p.id) && <span className="absolute bottom-0 right-0 size-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-950" />}</Link>
        <Link href={`/profile?id=${p.id}`} className="min-w-0 flex-1"><div className="font-bold text-sm flex items-center gap-1">{p.name} {p.verified && <BadgeCheck size={15} className="text-blue-500" />} {p.role === 'admin' && <span className="text-[10px] bg-amber-500/15 text-amber-500 px-1.5 py-0.5 rounded font-bold">ADMIN</span>}</div>
          <div className="text-xs text-zinc-500 truncate">{p.status || p.bio || '—'}</div></Link>
        <button onClick={() => toggleFollow(p)} className={`text-xs font-bold px-3 py-1.5 rounded-full border transition shrink-0 ${following.includes(p.id) ? 'border-zinc-200 dark:border-white/10 text-zinc-500' : 'bg-blue-600 text-white border-blue-600'}`}>{following.includes(p.id) ? 'Читаю' : 'Читать'}</button>
        <button onClick={() => router.push('/messages?dm=' + p.id)} className="p-2 rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-500 hover:border-blue-500 shrink-0" title="Написать"><MessageSquare size={15} /></button>
      </div>)}
      {!loading && shown.length === 0 && <Empty icon="🔍" title="Никого не нашёл" sub={sres !== null ? 'Попробуй другой запрос' : 'Поделись ссылкой-приглашением с друзьями!'} />}
    </div>
  </div>;
}
