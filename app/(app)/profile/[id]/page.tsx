'use client';
import { use, useEffect, useState } from 'react';
import { BadgeCheck, UserPlus, UserMinus, Ban, MessageSquare, Pencil } from 'lucide-react';
import { supaBrowser, isCloud } from '@/lib/supabase/client';
import { useStore } from '@/lib/store';
import { Avatar, Button, Empty } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/overlays';
import { timeAgo } from '@/lib/utils';
import type { Profile, Post } from '@/lib/supabase/types';

export default function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useStore(s => s.me);
  const cloud = isCloud() && me && !me.guest;
  const [p, setP] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [follow, setFollow] = useState<'none' | 'out' | 'mutual'>('none');
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ name: '', bio: '', status: '', avatar_url: '' });
  const mine = cloud && me?.id === id;
  useEffect(() => {
    if (!cloud) {
      if (id === 'guest' || !me || me.guest) setP({ id: 'guest', email: '', name: me?.name || 'Гость', avatar_url: null, cover_url: null, bio: 'Гостевой режим — войди, чтобы завести настоящий профиль', status: '', role: 'user', verified: false, is_private: false, last_seen: '', created_at: '' });
      return;
    }
    (async () => {
      const sb = supaBrowser();
      const { data } = await sb.from('profiles').select('*').eq('id', id).single();
      if (data) { setP(data as never); setForm({ name: data.name, bio: data.bio || '', status: data.status || '', avatar_url: data.avatar_url || '' }); }
      const { data: ps } = await sb.from('posts').select('*,author:profiles!posts_author_id_fkey(*)').eq('author_id', id).order('created_at', { ascending: false }).limit(20);
      setPosts((ps || []) as never[]);
      const [a, b, c] = await Promise.all([
        sb.from('follows').select('id', { count: 'exact', head: true }).eq('followee_id', id),
        sb.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', id),
        me ? sb.from('follows').select('*').eq('follower_id', me.id).eq('followee_id', id) : { data: [] },
      ]);
      setCounts({ followers: a.count || 0, following: b.count || 0 });
      if (c.data?.length) {
        const { data: back } = await sb.from('follows').select('*').eq('follower_id', id).eq('followee_id', me!.id);
        setFollow(back?.length ? 'mutual' : 'out');
      }
    })();
  }, [id, cloud, me]);
  const toggleFollow = async () => {
    if (!cloud || !me) return;
    if (follow === 'none') { await supaBrowser().from('follows').insert({ follower_id: me.id, followee_id: id }); setFollow('out'); }
    else { await supaBrowser().from('follows').delete().eq('follower_id', me.id).eq('followee_id', id); setFollow('none'); }
  };
  const block = async () => { if (!cloud || !me || !confirm('Заблокировать?')) return; await supaBrowser().from('blocks').insert({ user_id: me.id, blocked_id: id }); alert('Заблокирован'); };
  const save = async () => {
    await supaBrowser().from('profiles').update({ name: form.name, bio: form.bio, status: form.status, avatar_url: form.avatar_url || null }).eq('id', id);
    setEdit(false); location.reload();
  };
  const [genBusy, setGenBusy] = useState(false);
  const genAvatar = async () => {
    if (genBusy) return;
    setGenBusy(true);
    try {
      let key = ''; try { key = localStorage.getItem('legion-agnes-key') || ''; } catch {}
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key || undefined, mode: 'image', prompt: `stylish avatar portrait for a user named ${form.name || p?.name || 'Legion'}, digital art, centered composition, vibrant, no text, no watermark`, size: '1024x1024' }) });
      const j = await r.json();
      if (j.image) setForm({ ...form, avatar_url: j.image }); else alert('Не вышло (нужен Agnes-ключ)');
    } catch { alert('Не вышло'); }
    setGenBusy(false);
  };
  if (!p) return <div className="max-w-2xl mx-auto"><Empty icon="…" title="Загрузка…" /></div>;
  return <div className="max-w-2xl mx-auto">
    <div className="glass rounded-3xl overflow-hidden">
      <div className="h-32 bg-gradient-to-r from-blue-600 via-violet-600 to-orange-500" style={p.cover_url ? { backgroundImage: `url(${p.cover_url})`, backgroundSize: 'cover' } : {}} />
      <div className="p-5 pt-0">
        <div className="flex items-end gap-3 -mt-8">
          <div className="rounded-full p-1 bg-white dark:bg-zinc-950"><Avatar src={p.avatar_url} name={p.name} size={72} /></div>
          <div className="flex-1 pb-1"><div className="font-display font-bold text-lg flex items-center gap-1.5">{p.name} {p.verified && <BadgeCheck size={18} className="text-blue-500" />}</div>
            <div className="text-xs text-zinc-500">{p.status || '—'}</div></div>
          {mine && <Button size="sm" variant="outline" onClick={() => setEdit(true)}><Pencil size={14} /> Изменить</Button>}
        </div>
        {p.bio && <p className="text-sm mt-2 text-zinc-600 dark:text-zinc-300">{p.bio}</p>}
        <div className="flex gap-4 mt-2 text-sm font-bold"><span>{counts.followers} <span className="font-medium text-zinc-500">подписчиков</span></span><span>{counts.following} <span className="font-medium text-zinc-500">подписок</span></span></div>
        {!mine && cloud && <div className="flex gap-2 mt-3">
          <Button size="sm" onClick={toggleFollow}>{follow === 'none' ? <><UserPlus size={14} /> Подписаться</> : follow === 'mutual' ? <><UserMinus size={14} /> Взаимно · отписаться</> : <><UserMinus size={14} /> Отписаться</>}</Button>
          <Button size="sm" variant="outline" onClick={() => location.href = '/messages'}><MessageSquare size={14} /> Написать</Button>
          <Button size="sm" variant="outline" onClick={block} className="!text-rose-500"><Ban size={14} /></Button>
        </div>}
      </div>
    </div>
    <h2 className="font-bold mt-5 mb-2">Посты · {posts.length}</h2>
    <div className="flex flex-col gap-2.5 pb-10">
      {posts.length === 0 && <Empty icon="📝" title="Постов нет" />}
      {posts.map(x => <div key={x.id} className="glass rounded-2xl p-4"><p className="text-[15px] whitespace-pre-wrap">{x.text}</p><div className="text-xs text-zinc-500 mt-1.5">❤️ {x.likes} · 💬 {x.comments} · 🔁 {x.reposts} · {timeAgo(x.created_at)}</div></div>)}
    </div>
    <Dialog open={edit} onOpenChange={setEdit} title="Редактировать профиль">
      <div className="flex flex-col gap-2.5">
        {([['name', 'Имя'], ['status', 'Статус'], ['avatar_url', 'URL аватара'], ['bio', 'О себе']] as [string, string][]).map(([k, l]) => <label key={k} className="text-xs font-bold text-zinc-500">{l}<input value={(form as Record<string, string>)[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} className="mt-1 w-full h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm font-medium outline-none" /></label>)}
        <Button variant="outline" onClick={genAvatar} disabled={genBusy}>🎲 {genBusy ? 'Рисую…' : 'Сгенерировать аватар с AI'}</Button>
        <Button onClick={save}>Сохранить</Button>
      </div>
    </Dialog>
  </div>;
}
