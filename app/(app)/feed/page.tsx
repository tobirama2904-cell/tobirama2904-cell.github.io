'use client';
import { useCallback, useEffect, useState } from 'react';
import { Heart, MessageCircle, Repeat2, Sparkles, ImagePlus, Flag, Trash2, BadgeCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { supaBrowser, isCloud } from '@/lib/supabase/client';
import { useStore } from '@/lib/store';
import { Avatar, Button, Empty, Textarea } from '@/components/ui/primitives';
import { Stories } from '@/components/stories';
import { timeAgo, uid } from '@/lib/utils';
import { guestDB, saveGuest } from '@/lib/guest';
import type { Post, Comment } from '@/lib/supabase/types';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { DictateButton } from '@/components/dictate';

export default function FeedPage() {
  const me = useStore(s => s.me);
  const [posts, setPosts] = useState<Post[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [cDraft, setCDraft] = useState('');
  const [img, setImg] = useState('');
  const [imgBusy, setImgBusy] = useState(false);
  const [anim] = useAutoAnimate();
  const cloud = isCloud() && me && !me.guest;

  const load = useCallback(async () => {
    if (!cloud) { setPosts(guestDB().posts); return; }
    const { data } = await supaBrowser().from('posts').select('*,author:profiles!posts_author_id_fkey(*)').order('created_at', { ascending: false }).limit(50);
    setPosts((data || []) as never[]);
  }, [cloud]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!cloud) return;
    const ch = supaBrowser().channel('posts').on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => load()).subscribe();
    return () => { supaBrowser().removeChannel(ch); };
  }, [cloud, load]);

  const moderate = async (text: string) => {
    try {
      const r = await fetch('/api/moderate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      return await r.json();
    } catch { return { flag: false }; }
  };
  const publish = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    const mod = await moderate(draft);
    if (mod.flag) {
      if (cloud && me && !me.guest) await supaBrowser().from('reports').insert({ reporter_id: me.id, target_kind: 'post', target_id: 'auto', reason: 'AI-модерация: ' + (mod.reason || 'спам') });
      alert('⛔ Пост отклонён модерацией: ' + (mod.reason || 'похоже на спам')); setBusy(false); return;
    }
    if (!cloud) {
      const db = guestDB();
      db.posts.unshift({ id: uid(), author_id: 'guest', text: draft.trim(), image_url: img || null, likes: 0, comments: 0, reposts: 0, created_at: new Date().toISOString(), author: { id: 'guest', email: '', name: me?.name || 'Гость', avatar_url: null, cover_url: null, bio: '', status: '', role: 'user', verified: false, is_private: false, last_seen: '', created_at: '' } });
      saveGuest(db); setPosts(db.posts); setDraft(''); setImg(''); setBusy(false); return;
    }
    await supaBrowser().from('posts').insert({ author_id: me!.id, text: draft.trim(), image_url: img || null });
    setDraft(''); setImg(''); setBusy(false); load();
  };
  const aiImprove = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      let key = ''; try { key = localStorage.getItem('legion-agnes-key') || ''; } catch {}
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key || undefined, system: 'Улучши пост для соцсети: живо, коротко, с эмодзи. Только текст поста.', prompt: draft }) });
      const j = await r.json();
      if (j.text) setDraft(j.text.trim());
    } catch {}
    setBusy(false);
  };
  const aiImage = async () => {
    if (!draft.trim() || imgBusy) return;
    setImgBusy(true);
    try {
      let key = ''; try { key = localStorage.getItem('legion-agnes-key') || ''; } catch {}
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key || undefined, mode: 'image', prompt: draft.trim().slice(0, 500) }) });
      const j = await r.json();
      if (j.image) setImg(j.image); else alert('Картинка не вышла (нужен Agnes-ключ)');
    } catch { alert('Картинка не вышла'); }
    setImgBusy(false);
  };
  const like = async (p: Post) => {
    if (!cloud || !me || me.guest) { setPosts(posts.map(x => x.id === p.id ? { ...x, likes: x.likes + (x.liked ? -1 : 1), liked: !x.liked } : x)); return; }
    if (p.liked) { await supaBrowser().from('likes').delete().eq('post_id', p.id).eq('user_id', me.id); }
    else { await supaBrowser().from('likes').insert({ post_id: p.id, user_id: me.id }); }
    setPosts(posts.map(x => x.id === p.id ? { ...x, likes: x.likes + (x.liked ? -1 : 1), liked: !x.liked } : x));
  };
  const repost = async (p: Post) => {
    if (!cloud || !me || me.guest) return;
    await supaBrowser().from('reposts').insert({ post_id: p.id, user_id: me.id });
    setPosts(posts.map(x => x.id === p.id ? { ...x, reposts: x.reposts + 1, reposted: true } : x));
  };
  const loadComments = async (postId: string) => {
    setOpenComments(postId);
    if (!cloud) { setComments([]); return; }
    const { data } = await supaBrowser().from('comments').select('*,author:profiles!comments_author_id_fkey(*)').eq('post_id', postId).order('created_at');
    setComments((data || []) as never[]);
  };
  const sendComment = async () => {
    if (!cDraft.trim() || !openComments || !cloud || !me || me.guest) return;
    await supaBrowser().from('comments').insert({ post_id: openComments, author_id: me.id, text: cDraft.trim() });
    setCDraft(''); loadComments(openComments); load();
  };
  const remove = async (p: Post) => {
    if (!confirm('Удалить пост?')) return;
    if (!cloud) { const db = guestDB(); db.posts = db.posts.filter(x => x.id !== p.id); saveGuest(db); setPosts(db.posts); return; }
    await supaBrowser().from('posts').delete().eq('id', p.id); load();
  };
  const report = async (p: Post) => {
    if (!cloud || !me || me.guest) return;
    const reason = prompt('Причина жалобы:') || 'спам';
    await supaBrowser().from('reports').insert({ reporter_id: me.id, target_kind: 'post', target_id: p.id, reason });
    alert('Жалоба отправлена модерации');
  };

  const [digest, setDigest] = useState('');
  const [digestBusy, setDigestBusy] = useState(false);
  const makeDigest = async () => {
    setDigestBusy(true);
    try {
      let key = ''; try { key = localStorage.getItem('legion-agnes-key') || ''; } catch {}
      const r = await fetch('/api/digest', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key || undefined, feed: posts.slice(0, 20).map(p => `${p.author?.name}: ${p.text}`), chats: [] }) });
      setDigest((await r.json()).digest || '');
    } catch { setDigest('Не вышло (нужен Agnes-ключ)'); }
    setDigestBusy(false);
  };
  return <div className="max-w-2xl mx-auto">
    <div className="flex items-center gap-2 mb-3">
      <h1 className="font-display font-bold text-xl">Лента {!cloud && <span className="text-xs text-zinc-500 font-sans">· гостевой режим</span>}</h1>
      <Button size="sm" variant="outline" className="ml-auto" onClick={makeDigest} disabled={digestBusy}><Sparkles size={14} /> Дайджест</Button>
    </div>
    {digest && <div className="glass rounded-2xl p-4 mb-3 text-sm leading-relaxed whitespace-pre-wrap animate-[msgIn_.35s]"><b>✨ Что нового:</b><br />{digest}</div>}
    <Stories />
    <div className="glass rounded-2xl p-4 mt-3">
      <Textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder={me && !me.guest ? `Что нового, ${me.name}?` : 'Что нового? (гость — посты только у тебя)'} rows={3} maxLength={2000} />
      {img && <div className="relative mt-2"><img src={img} alt="" className="rounded-xl max-h-52 w-full object-cover" /><button onClick={() => setImg('')} className="absolute top-2 right-2 size-7 grid place-items-center rounded-full bg-black/60 text-white text-sm">✕</button></div>}
      <div className="flex gap-2 mt-2.5">
        <DictateButton className="!size-10 !rounded-xl" onText={t => setDraft(v => (v ? v + ' ' : '') + t)} />
        <Button onClick={publish} disabled={busy || !draft.trim()}>{busy ? '…' : 'Опубликовать'}</Button>
        <Button variant="outline" onClick={aiImprove} disabled={busy || !draft.trim()}><Sparkles size={15} /> Улучшить с AI</Button>
        <Button variant="outline" onClick={aiImage} disabled={busy || imgBusy || !draft.trim()}><ImagePlus size={15} /> {imgBusy ? 'Рисую…' : 'Картинка'}</Button>
        <span className="ml-auto text-xs text-zinc-400 self-center">AI-модерация включена</span>
      </div>
    </div>
    <div ref={anim} className="flex flex-col gap-3 mt-3 pb-10">
      {posts.length === 0 && <Empty icon="📰" title="Пока пусто" sub="Стань первым — напиши пост выше" />}
      {posts.map(p => <motion.article key={p.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2.5">
          <Avatar src={p.author?.avatar_url} name={p.author?.name || '?'} size={42} />
          <div className="flex-1 min-w-0"><div className="font-bold text-sm flex items-center gap-1">{p.author?.name} {p.author?.verified && <BadgeCheck size={15} className="text-blue-500" />}</div>
            <div className="text-[11px] text-zinc-500">{timeAgo(p.created_at)}</div></div>
          {(me?.id === p.author_id || me?.role === 'admin') && <button onClick={() => remove(p)} className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 size={15} /></button>}
          {me?.id !== p.author_id && cloud && <button onClick={() => report(p)} className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-500 hover:bg-amber-500/10"><Flag size={15} /></button>}
        </div>
        <p className="mt-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">{p.text}</p>
        {p.image_url && <img src={p.image_url} alt="" className="mt-2.5 rounded-xl max-h-80 w-full object-cover" />}
        <div className="flex gap-1 mt-3">
          <button onClick={() => like(p)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition active:scale-90 ${p.liked ? 'text-rose-500 bg-rose-500/10' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5'}`}><Heart size={16} fill={p.liked ? 'currentColor' : 'none'} />{p.likes}</button>
          <button onClick={() => openComments === p.id ? setOpenComments(null) : loadComments(p.id)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5 transition"><MessageCircle size={16} />{p.comments}</button>
          <button onClick={() => repost(p)} disabled={p.reposted} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition ${p.reposted ? 'text-emerald-500' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5'}`}><Repeat2 size={16} />{p.reposts}</button>
        </div>
        {openComments === p.id && <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-white/10 flex flex-col gap-2">
          {comments.map(c => <div key={c.id} className="flex gap-2"><Avatar src={c.author?.avatar_url} name={c.author?.name || '?'} size={28} /><div className="rounded-xl bg-zinc-100 dark:bg-white/5 px-3 py-1.5 text-sm"><b>{c.author?.name}</b> {c.text}</div></div>)}
          {cloud && <div className="flex gap-2"><input value={cDraft} onChange={e => setCDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendComment()} placeholder="Комментарий…" className="flex-1 h-9 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none focus:border-blue-500" /><Button size="sm" onClick={sendComment}>OK</Button></div>}
        </div>}
      </motion.article>)}
    </div>
  </div>;
}
