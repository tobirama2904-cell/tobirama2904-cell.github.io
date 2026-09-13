'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BadgeCheck, UserPlus, UserMinus, Ban, MessageSquare, Pencil, Copy, Check, LogOut, KeyRound, ShieldCheck } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Avatar, Button, Empty } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/overlays';
import { timeAgo } from '@/lib/utils';
import { nip19 } from 'nostr-tools';
import {
  getProfile, saveProfile, getPosts, getFollowing, followersOf, setFollow,
  blockUser, unblockUser, mutedList, setPin, getPin, publishView, getViews,
} from '@/lib/hybrid/social';
import { uploadFile } from '@/lib/hybrid/storage';
import { exportNsec, signOut } from '@/lib/hybrid/identity';
import { lastSeenMs } from '@/lib/hybrid/live';
import { onOnline } from '@/lib/hybrid/live';
import type { Profile, Post } from '@/lib/supabase/types';

function agnesKey(): string {
  try { return localStorage.getItem('legion-agnes-key') || ''; } catch { return ''; }
}

function Inner() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const params = useSearchParams();
  const id = mounted ? (params.get('id') || '') : '';
  const router = useRouter();
  const me = useStore(s => s.me);
  const logged = me && !me.guest;
  const [p, setP] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [follow, setFollowSt] = useState<'none' | 'out' | 'mutual'>('none');
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [followList, setFollowList] = useState<{ title: string; ids: string[] } | null>(null);
  const [followProfs, setFollowProfs] = useState<Profile[]>([]);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ name: '', bio: '', status: '', avatar_url: '', cover_url: '' });
  const [isPrivate, setIsPrivate] = useState(false);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [online, setOnline] = useState<string[]>([]);
  const [copied, setCopied] = useState('');
  const [pinId, setPinId] = useState<string | null>(null);
  const [viewsN, setViewsN] = useState(0);
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [upBusy, setUpBusy] = useState('');
  const mine = logged && me.id === id;

  const load = useCallback(async () => {
    if (!id || !/^[0-9a-f]{64}$/i.test(id)) { setP(null); return; }
    try {
      const [prof, ps, fing, fers, muted] = await Promise.all([
        getProfile(id).catch(() => null),
        getPosts({ author: id, limit: 30 }).catch(() => []),
        getFollowing(id).catch((): string[] => []),
        followersOf(id).catch((): string[] => []),
        logged ? mutedList().catch((): string[] => []) : Promise.resolve([]),
      ]);
      if (!prof) return;
      setP(prof);
      setPosts(ps);
      getPin(id).then(v => setPinId(v)).catch(() => {});
      if (!mine) publishView('profile:' + id);
      getViews('profile:' + id).then(n => setViewsN(n)).catch(() => {});
      setCounts({ followers: fers.length, following: fing.length });
      setBlocked(muted);
      if (mine) {
        setForm({ name: prof.name, bio: prof.bio || '', status: prof.status || '', avatar_url: prof.avatar_url || '', cover_url: prof.cover_url || '' });
        setIsPrivate(prof.is_private);
      }
      if (logged && !mine && me && !me.guest) {
        const myFing = await getFollowing(me.id).catch((): string[] => []);
        if (myFing.includes(id)) setFollowSt(fers.includes(me.id) ? 'mutual' : 'out');
        else setFollowSt('none');
      }
    } catch {}
  }, [id, logged, me, mine]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => onOnline(ids => setOnline(ids)), []);

  const toggleFollow = async () => {
    if (!logged || !me || mine) return;
    if (follow === 'none') { await setFollow(id, true).catch(() => {}); setFollowSt('out'); setCounts(c => ({ ...c, followers: c.followers + 1 })); }
    else { await setFollow(id, false).catch(() => {}); setFollowSt('none'); setCounts(c => ({ ...c, followers: Math.max(0, c.followers - 1) })); }
  };
  const block = async () => {
    if (!logged || mine) return;
    if (blocked.includes(id)) {
      if (!confirm('Разблокировать?')) return;
      await unblockUser(id).catch(() => {});
      setBlocked(blocked.filter(x => x !== id));
    } else {
      if (!confirm('Заблокировать? Его посты и сообщения исчезнут у тебя.')) return;
      await blockUser(id).catch(() => {});
      setBlocked([...blocked, id]);
    }
  };
  const save = async () => {
    if (!mine) return;
    setBusy(true);
    try {
      const np = await saveProfile({ name: form.name, bio: form.bio, status: form.status, avatar_url: form.avatar_url || null, cover_url: form.cover_url || null, is_private: isPrivate });
      if (np) setP(np);
      setEdit(false);
    } catch { alert('Не сохранено — проверь сеть'); }
    setBusy(false);
  };
  const upAvatar = async (f: File, field: 'avatar_url' | 'cover_url') => {
    setUpBusy(field);
    try {
      const url = await uploadFile(f);
      setForm(prev => ({ ...prev, [field]: url }));
    } catch { alert('Загрузка не удалась'); }
    setUpBusy('');
  };
  const genAvatar = async () => {
    if (genBusy) return;
    setGenBusy(true);
    try {
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: agnesKey() || undefined, mode: 'image', prompt: `stylish avatar portrait for a user named ${form.name || p?.name || 'Legion'}, digital art, centered composition, vibrant, no text, no watermark`, size: '1024x1024' }) });
      const j = await r.json();
      if (j.image) setForm({ ...form, avatar_url: j.image }); else alert('Не вышло (нужен Agnes-ключ)');
    } catch { alert('Не вышло'); }
    setGenBusy(false);
  };
  const copy = async (text: string, tag: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(''), 1500); } catch {}
  };
  const openFollowList = async (which: 'followers' | 'following') => {
    const ids = which === 'followers' ? await followersOf(id).catch((): string[] => []) : await getFollowing(id).catch((): string[] => []);
    setFollowList({ title: which === 'followers' ? 'Подписчики' : 'Подписки', ids });
    setFollowProfs([]);
    const rows = await Promise.all(ids.slice(0, 50).map(x => getProfile(x).catch(() => null)));
    setFollowProfs(rows.filter(Boolean) as Profile[]);
  };
  const logout = () => { signOut(); router.push('/'); };

  if (!me) return <div className="max-w-2xl mx-auto"><Empty icon="…" title="Загрузка…" /></div>;
  if (!id) return <div className="max-w-2xl mx-auto"><Empty icon="👤" title="Нет id профиля" /></div>;
  if (!p) return <div className="max-w-2xl mx-auto"><Empty icon="…" title="Загружаю профиль с релеев…" /></div>;
  const npub = (() => { try { return nip19.npubEncode(id); } catch { return ''; } })();
  const isOnline = online.includes(id);
  const hiddenByPrivacy = p.is_private && !mine && follow === 'none';
  return <div className="max-w-2xl mx-auto">
    <div className="glass rounded-3xl overflow-hidden">
      <div className="h-32 bg-gradient-to-r from-blue-600 via-violet-600 to-orange-500" style={p.cover_url ? { backgroundImage: `url(${p.cover_url})`, backgroundSize: 'cover' } : {}} />
      <div className="p-5 pt-0">
        <div className="flex items-end gap-3 -mt-8">
          <div className="relative rounded-full p-1 bg-white dark:bg-zinc-950">
            <Avatar src={p.avatar_url} name={p.name} size={72} />
            {isOnline && <span className="absolute bottom-1 right-1 size-4 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-950" />}
          </div>
          <div className="flex-1 pb-1 min-w-0">
            <div className="font-display font-bold text-lg flex items-center gap-1.5 flex-wrap">{p.name} {p.verified && <BadgeCheck size={18} className="text-blue-500" />} {p.role === 'admin' && <span className="text-[10px] bg-amber-500/15 text-amber-500 px-1.5 py-0.5 rounded font-bold">ADMIN</span>}</div>
            <div className="text-xs text-zinc-500">{p.status || '—'} · {isOnline ? <span className="text-emerald-500 font-bold">онлайн</span> : lastSeenMs(id) ? 'был(а) ' + timeAgo(lastSeenMs(id)) : 'офлайн'}</div>
          </div>
          {mine && <Button size="sm" variant="outline" onClick={() => setEdit(true)}><Pencil size={14} /> Изменить</Button>}
        </div>
        {p.bio && <p className="text-sm mt-2 text-zinc-600 dark:text-zinc-300">{p.bio}</p>}
        <div className="flex gap-4 mt-2 text-sm font-bold">
          <button onClick={() => openFollowList('followers')} className="hover:underline">{counts.followers} <span className="font-medium text-zinc-500">подписчиков</span></button>
          <button onClick={() => openFollowList('following')} className="hover:underline">{counts.following} <span className="font-medium text-zinc-500">подписок</span></button>
          {p.is_private && <span className="text-xs text-zinc-400 self-center">🔒 приватный</span>}
        </div>
        {npub && <button onClick={() => copy(npub, 'npub')} className="mt-2 text-[11px] font-mono text-zinc-400 hover:text-blue-500 flex items-center gap-1">{copied === 'npub' ? <Check size={12} /> : <Copy size={12} />}{npub.slice(0, 24)}…</button>}
        {!mine && logged && <div className="flex gap-2 mt-3 flex-wrap">
          <Button size="sm" onClick={toggleFollow}>{follow === 'none' ? <><UserPlus size={14} /> Подписаться</> : follow === 'mutual' ? <><UserMinus size={14} /> Взаимно · отписаться</> : <><UserMinus size={14} /> Отписаться</>}</Button>
          <Button size="sm" variant="outline" onClick={() => router.push('/messages?dm=' + id)}><MessageSquare size={14} /> Написать</Button>
          <Button size="sm" variant="outline" onClick={block} className="!text-rose-500"><Ban size={14} /> {blocked.includes(id) ? 'Разблок' : ''}</Button>
        </div>}
        {mine && <div className="flex gap-2 mt-3 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => { const k = exportNsec(); if (k) copy(k, 'nsec'); }}><KeyRound size={14} /> {copied === 'nsec' ? 'Ключ скопирован!' : 'Мой nsec-ключ'}</Button>
          {me.role === 'admin' && <Link href="/admin"><Button size="sm" variant="outline" className="!text-amber-500"><ShieldCheck size={14} /> Админка</Button></Link>}
          <Button size="sm" variant="outline" onClick={logout} className="!text-rose-500"><LogOut size={14} /> Выйти</Button>
        </div>}
      </div>
    </div>
    {!hiddenByPrivacy && (() => { const ph = posts.filter(x => x.image_url); return ph.length > 0 ? <>
      <h2 className="font-bold mt-5 mb-2">Фото · {ph.length}</h2>
      <div className="grid grid-cols-3 gap-1.5 mb-1">{ph.slice(0, 9).map(x => <img key={x.id} src={x.image_url!} alt="" loading="lazy" className="aspect-square w-full object-cover rounded-xl" />)}</div>
    </> : null; })()}
    <h2 className="font-bold mt-5 mb-2">Посты · {posts.length} <span className="text-xs font-sans font-bold text-zinc-400">👁 {viewsN}</span></h2>
    {!hiddenByPrivacy && pinId && posts.some(x => x.id === pinId) && (() => { const px = posts.find(x => x.id === pinId)!; return <div className="glass rounded-2xl p-4 mb-2.5 border-blue-500/40">
      <div className="text-[11px] font-bold text-blue-500 mb-1">📌 ЗАКРЕПЛЕНО</div>
      <p className="text-[15px] whitespace-pre-wrap">{px.text}</p>
      {px.image_url && <img src={px.image_url} alt="" className="mt-2 rounded-xl max-h-64 w-full object-cover" />}
      {px.video_url && <video src={px.video_url} controls className="mt-2 rounded-xl max-h-64 w-full" />}
    </div>; })()}
    <div className="flex flex-col gap-2.5 pb-10">
      {hiddenByPrivacy && <Empty icon="🔒" title="Приватный профиль" sub="Подпишись, чтобы видеть посты" />}
      {!hiddenByPrivacy && posts.length === 0 && <Empty icon="📝" title="Постов нет" />}
      {!hiddenByPrivacy && posts.map(x => <div key={x.id} className="glass rounded-2xl p-4">
        <p className="text-[15px] whitespace-pre-wrap">{x.text}</p>
        {x.image_url && <img src={x.image_url} alt="" className="mt-2 rounded-xl max-h-64 w-full object-cover" />}
        {x.video_url && <video src={x.video_url} controls className="mt-2 rounded-xl max-h-64 w-full" />}
        <div className="text-xs text-zinc-500 mt-1.5">❤️ {x.likes} · 💬 {x.comments} · 🔁 {x.reposts} · {timeAgo(x.created_at)}{mine && <button onClick={async () => { const v = pinId === x.id ? null : x.id; await setPin(v); setPinId(v); }} className="ml-2 font-bold text-blue-500">{pinId === x.id ? 'Открепить' : '📌 Закрепить'}</button>}</div>
      </div>)}
    </div>
    <Dialog open={edit} onOpenChange={setEdit} title="Редактировать профиль">
      <div className="flex flex-col gap-2.5">
        {([['name', 'Имя'], ['status', 'Статус'], ['bio', 'О себе']] as [string, string][]).map(([k, l]) => <label key={k} className="text-xs font-bold text-zinc-500">{l}<input value={(form as Record<string, string>)[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} className="mt-1 w-full h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm font-medium outline-none" /></label>)}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-bold text-zinc-500">Аватар
            <div className="mt-1 flex items-center gap-2">
              <Avatar src={form.avatar_url} name={form.name} size={44} />
              <label className="text-xs font-bold text-blue-500 cursor-pointer hover:underline">{upBusy === 'avatar_url' ? '…' : 'Загрузить'}
                <input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) upAvatar(f, 'avatar_url'); e.target.value = ''; }} /></label>
            </div>
          </label>
          <label className="text-xs font-bold text-zinc-500">Обложка
            <div className="mt-1 h-11 rounded-xl bg-zinc-100 dark:bg-white/5 overflow-hidden relative">
              {form.cover_url && <img src={form.cover_url} alt="" className="w-full h-full object-cover" />}
              <label className="absolute inset-0 grid place-items-center text-xs font-bold text-blue-500 bg-black/20 cursor-pointer">{upBusy === 'cover_url' ? '…' : 'Загрузить'}
                <input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) upAvatar(f, 'cover_url'); e.target.value = ''; }} /></label>
            </div>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold cursor-pointer"><input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} className="size-4 accent-blue-600" />🔒 Приватный профиль <span className="font-medium text-zinc-500 text-xs">(видят только подписчики)</span></label>
        <Button variant="outline" onClick={genAvatar} disabled={genBusy}>🎲 {genBusy ? 'Рисую…' : 'Сгенерировать аватар с AI'}</Button>
        <Button onClick={save} disabled={busy}>{busy ? 'Сохраняю…' : 'Сохранить'}</Button>
      </div>
    </Dialog>
    <Dialog open={!!followList} onOpenChange={v => !v && setFollowList(null)} title={followList?.title || ''}>
      <div className="flex flex-col gap-0.5 max-h-80 overflow-y-auto">
        {followProfs.map(f => <Link key={f.id} href={`/profile?id=${f.id}`} className="flex items-center gap-2.5 rounded-xl p-2 hover:bg-zinc-100 dark:hover:bg-white/5">
          <Avatar src={f.avatar_url} name={f.name} size={34} />
          <div className="min-w-0"><b className="text-sm flex items-center gap-1">{f.name} {f.verified && <BadgeCheck size={13} className="text-blue-500" />}</b><div className="text-[11px] text-zinc-500 truncate">{f.status || '—'}</div></div>
        </Link>)}
        {followProfs.length === 0 && <div className="text-sm text-zinc-500 text-center py-4">Загружаю…</div>}
      </div>
    </Dialog>
  </div>;
}

export default function ProfilePage() {
  return <Suspense><Inner /></Suspense>;
}
