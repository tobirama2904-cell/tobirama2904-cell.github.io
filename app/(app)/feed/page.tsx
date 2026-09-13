'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart, MessageCircle, Repeat2, Sparkles, ImagePlus, Flag, Trash2, BadgeCheck, Video, CalendarPlus, MapPin, BarChart3, Languages, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '@/lib/store';
import { Avatar, Button, Empty, Textarea } from '@/components/ui/primitives';
import { Tabs } from '@/components/ui/overlays';
import { Stories } from '@/components/stories';
import { timeAgo } from '@/lib/utils';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { DictateButton } from '@/components/dictate';
import {
  getPosts, publishPost, deletePost, setLike, publishRepost, getComments, publishComment,
  getProfile, getAnnouncements, publishEvent, listEvents, rsvpEvent, getPostsByTag, type LegionEvent,
} from '@/lib/hybrid/social';
import { votePoll, getPollVotes } from '@/lib/hybrid/dm';
import { uploadFile } from '@/lib/hybrid/storage';
import { applyMod } from '@/lib/hybrid/banlist';
import type { Post, Comment, Profile } from '@/lib/supabase/types';

function agnesKey(): string {
  try { return localStorage.getItem('legion-agnes-key') || ''; } catch { return ''; }
}
function parsePoll(p: Post): { q: string; opts: string[] } | null {
  if (p.kindTag !== 'poll') return null;
  try { const j = JSON.parse(p.text); if (j.q && Array.isArray(j.opts)) return j; } catch {}
  return null;
}
function PostText({ text, onTag }: { text: string; onTag: (t: string) => void }) {
  const parts = text.split(/(#[\p{L}\p{N}_]{2,30})/gu);
  return <>{parts.map((pt, i) => pt.startsWith('#') && pt.length > 2
    ? <button key={i} onClick={() => onTag(pt.slice(1))} className="text-blue-500 font-semibold hover:underline">{pt}</button>
    : <span key={i}>{pt}</span>)}</>;
}
function PostBody({ p, votes, onVote, onTag, translation }: {
  p: Post; votes?: { counts: number[]; mine: number; total: number }; onVote: (i: number) => void; onTag: (t: string) => void; translation?: string;
}) {
  const poll = parsePoll(p);
  if (poll) return <div className="mt-2.5 rounded-2xl border border-zinc-200 dark:border-white/10 p-3 bg-zinc-50 dark:bg-white/[.03]">
    <div className="font-bold text-[15px]">📊 {poll.q}</div>
    <div className="flex flex-col gap-1.5 mt-2">
      {poll.opts.map((o, i) => {
        const n = votes?.counts[i] || 0;
        const pct = votes && votes.total > 0 ? Math.round(n / votes.total * 100) : 0;
        const isMine = votes?.mine === i;
        return <button key={i} onClick={() => onVote(i)} className={`relative text-left rounded-xl px-3 py-2 text-sm font-semibold overflow-hidden border ${isMine ? 'border-emerald-500' : 'border-zinc-300 dark:border-white/15'}`}>
          <span className="absolute inset-y-0 left-0 bg-blue-500/20" style={{ width: pct + '%' }} />
          <span className="relative">{isMine ? '✅ ' : ''}{o} <span className="opacity-60">· {n}</span></span>
        </button>;
      })}
    </div>
    <div className="text-[11px] text-zinc-500 mt-1.5">голосов: {votes?.total || 0}</div>
  </div>;
  return <>
    <p className="mt-2.5 text-[15px] leading-relaxed whitespace-pre-wrap"><PostText text={p.text} onTag={onTag} /></p>
    {translation && <div className="mt-2 rounded-xl bg-violet-500/10 border border-violet-500/25 p-2.5 text-sm whitespace-pre-wrap">🌐 {translation}</div>}
  </>;
}

export default function FeedPage() {
  const me = useStore(s => s.me);
  const logged = me && !me.guest;
  const [tab, setTab] = useState('feed');
  const [posts, setPosts] = useState<Post[]>([]);
  const [profs, setProfs] = useState<Record<string, Profile>>({});
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [cDraft, setCDraft] = useState('');
  const [img, setImg] = useState('');
  const [vid, setVid] = useState('');
  const [imgBusy, setImgBusy] = useState(false);
  const [digest, setDigest] = useState('');
  const [digestBusy, setDigestBusy] = useState(false);
  const [anns, setAnns] = useState<{ id: string; title: string; body: string }[]>([]);
  const [events, setEvents] = useState<LegionEvent[]>([]);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQ, setPollQ] = useState('');
  const [pollOpts, setPollOpts] = useState<string[]>(['', '']);
  const [feedVotes, setFeedVotes] = useState<Record<string, { counts: number[]; mine: number; total: number }>>({});
  const [trans, setTrans] = useState<Record<string, string>>({});
  const [transBusy, setTransBusy] = useState('');
  const [tagView, setTagView] = useState<{ tag: string; posts: Post[]; done?: boolean } | null>(null);
  const [evForm, setEvForm] = useState(false);
  const [ev, setEv] = useState({ title: '', at: '', place: '', about: '' });
  const [anim] = useAutoAnimate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ps, an, evs] = await Promise.all([
        getPosts({ limit: 50 }).catch(() => []),
        getAnnouncements().catch(() => []),
        listEvents().catch(() => []),
      ]);
      setPosts(ps);
      setAnns(an.slice(0, 3));
      setEvents(evs);
      const ids = [...new Set(ps.map(p => p.author_id))];
      const rows = await Promise.all(ids.slice(0, 50).map(id => getProfile(id).catch(() => null)));
      const m: Record<string, Profile> = {};
      rows.forEach(p => { if (p) m[p.id] = p; });
      setProfs(m);
    } catch {}
    setLoading(false);
  }, []);
  useEffect(() => { if (logged) load(); else setLoading(false); }, [logged, load]);
  useEffect(() => {
    posts.filter(p => (p as Post).kindTag === 'poll' && !feedVotes[p.id]).slice(0, 6).forEach(p => {
      getPollVotes(p.id).then(v => setFeedVotes(prev => ({ ...prev, [p.id]: v }))).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts]);

  const publish = async () => {
    if (!draft.trim() && !img && !vid) return;
    if (busy || !logged) return;
    setBusy(true);
    try {
      const mod = await (await fetch('/api/moderate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: draft }) })).json().catch(() => ({ flag: false }));
      if (mod.flag) { alert('⛔ Пост отклонён модерацией: ' + (mod.reason || 'похоже на спам')); setBusy(false); return; }
      const p = await publishPost(draft.trim(), img || null, vid || null);
      if (p) { setDraft(''); setImg(''); setVid(''); await load(); }
      else alert('Не опубликовано — проверь сеть');
    } catch { alert('Не опубликовано — проверь сеть'); }
    setBusy(false);
  };
  const aiImprove = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: agnesKey() || undefined, system: 'Улучши пост для соцсети: живо, коротко, с эмодзи. Только текст поста.', prompt: draft }) });
      const j = await r.json();
      if (j.text) setDraft(j.text.trim());
      else alert('Нужен Agnes-ключ (AI Чат → Ключ)');
    } catch {}
    setBusy(false);
  };
  const aiImage = async () => {
    if (!draft.trim() || imgBusy) return;
    setImgBusy(true);
    try {
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: agnesKey() || undefined, mode: 'image', prompt: draft.trim().slice(0, 500) }) });
      const j = await r.json();
      if (j.image) setImg(j.image); else alert('Картинка не вышла (нужен Agnes-ключ)');
    } catch { alert('Картинка не вышла'); }
    setImgBusy(false);
  };
  const attach = async (f: File) => {
    setImgBusy(true);
    try {
      const url = await uploadFile(f);
      if (f.type.startsWith('video')) setVid(url); else setImg(url);
    } catch { alert('Загрузка не удалась'); }
    setImgBusy(false);
  };
  const like = async (p: Post) => {
    if (!logged || !me) return;
    const on = !p.liked;
    setPosts(posts.map(x => x.id === p.id ? { ...x, likes: x.likes + (on ? 1 : -1), liked: on } : x));
    await setLike(p.id, p.author_id, on).catch(() => {});
  };
  const repost = async (p: Post) => {
    if (!logged || p.reposted) return;
    await publishRepost(p.id, p.author_id).catch(() => {});
    setPosts(posts.map(x => x.id === p.id ? { ...x, reposts: x.reposts + 1, reposted: true } : x));
  };
  const loadComments = async (postId: string) => {
    if (openComments === postId) { setOpenComments(null); return; }
    setOpenComments(postId);
    try {
      const cs = await getComments(postId);
      setComments(cs);
      const ids = [...new Set(cs.map(c => c.author_id))].filter(id => !profs[id]);
      if (ids.length) {
        const rows = await Promise.all(ids.slice(0, 20).map(id => getProfile(id).catch(() => null)));
        const m: Record<string, Profile> = {};
        rows.forEach(p => { if (p) m[p.id] = p; });
        setProfs(prev => ({ ...prev, ...m }));
      }
    } catch { setComments([]); }
  };
  const sendComment = async () => {
    if (!cDraft.trim() || !openComments || !logged) return;
    const p = posts.find(x => x.id === openComments);
    await publishComment(openComments, p?.author_id || '', cDraft.trim()).catch(() => {});
    setCDraft('');
    setComments(await getComments(openComments).catch(() => []));
  };
  const remove = async (p: Post) => {
    if (!me || me.guest) return;
    const mine = me.id === p.author_id;
    if (!mine && me.role !== 'admin') return;
    if (!confirm(mine ? 'Удалить пост?' : 'Удалить чужой пост (админ)?')) return;
    try {
      await deletePost(p.id);
      if (!mine && me.role === 'admin') await applyMod('hide', p.id).catch(() => {});
    } catch {}
    setPosts(posts.filter(x => x.id !== p.id));
  };
  const report = async (p: Post) => {
    if (!logged) return;
    const reason = prompt('Причина жалобы:') || 'спам';
    const { publishReport } = await import('@/lib/hybrid/social');
    await publishReport('post', p.id, reason).catch(() => {});
    alert('Жалоба отправлена модерации');
  };
  const makeDigest = async () => {
    setDigestBusy(true);
    try {
      const r = await fetch('/api/digest', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: agnesKey() || undefined, feed: posts.slice(0, 20).map(p => `${profs[p.author_id]?.name || ''}: ${p.text}`), chats: [] }) });
      setDigest((await r.json()).digest || '');
    } catch { setDigest('Не вышло (нужен Agnes-ключ)'); }
    setDigestBusy(false);
  };
  const publishPoll = async () => {
    if (!pollQ.trim() || !logged) return;
    const opts = pollOpts.map(o => o.trim()).filter(Boolean);
    if (opts.length < 2) { alert('Нужно минимум 2 варианта'); return; }
    setBusy(true);
    try {
      const p = await publishPost(JSON.stringify({ q: pollQ.trim().slice(0, 200), opts: opts.slice(0, 6) }), null, null, [['legion-kind', 'poll']]);
      if (p) { setPollOpen(false); setPollQ(''); setPollOpts(['', '']); await load(); }
      else alert('Не опубликовано — проверь сеть');
    } catch { alert('Не опубликовано — проверь сеть'); }
    setBusy(false);
  };
  const translatePost = async (p: Post) => {
    if (trans[p.id] || transBusy) return;
    setTransBusy(p.id);
    try {
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: agnesKey() || undefined, system: 'Определи язык текста. Если не русский — переведи на русский. Если русский — переведи на английский. Только перевод, без комментариев.', prompt: p.text.slice(0, 1000) }) });
      const j = await r.json();
      if (j.text) setTrans(prev => ({ ...prev, [p.id]: j.text }));
      else alert('Нужен Agnes-ключ (AI Чат → Ключ)');
    } catch {}
    setTransBusy('');
  };
  const openTag = async (tag: string) => {
    setTagView({ tag, posts: [] });
    try {
      let ps: Post[] = [];
      for (let i = 0; i < 3 && ps.length === 0; i++) {
        ps = await getPostsByTag(tag);
        if (ps.length === 0 && i < 2) await new Promise(r => setTimeout(r, 4000));
      }
      setTagView({ tag, posts: ps, done: true });
      const ids = [...new Set(ps.map(p => p.author_id))].filter(id => !profs[id]);
      if (ids.length) {
        const rows = await Promise.all(ids.slice(0, 30).map(id => getProfile(id).catch(() => null)));
        const m: Record<string, Profile> = {};
        rows.forEach(x => { if (x) m[x.id] = x; });
        setProfs(prev => ({ ...prev, ...m }));
      }
    } catch { setTagView({ tag, posts: [], done: true }); }
  };
  const createEvent = async () => {
    if (!ev.title.trim() || !logged) return;
    const e = await publishEvent(ev).catch(() => null);
    if (e) { setEvents([e, ...events]); setEv({ title: '', at: '', place: '', about: '' }); setEvForm(false); }
    else alert('Не создано — проверь сеть');
  };

  if (!me) return <div className="max-w-2xl mx-auto"><Empty icon="📰" title="Загрузка…" /></div>;
  if (me.guest) return <div className="max-w-2xl mx-auto"><h1 className="font-display font-bold text-xl mb-3">Лента</h1><Empty icon="📰" title="Войди, чтобы видеть ленту" sub="Лента — это живые посты людей сети LEGION" /></div>;
  return <div className="max-w-2xl mx-auto">
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <h1 className="font-display font-bold text-xl">Соцсеть</h1>
      <Button size="sm" variant="outline" className="ml-auto" onClick={makeDigest} disabled={digestBusy}><Sparkles size={14} /> Дайджест</Button>
      <Button size="sm" variant="outline" onClick={load}>↻</Button>
    </div>
    <Tabs value={tab} onValue={setTab} tabs={[{ v: 'feed', label: '📰 Лента' }, { v: 'events', label: `📅 События (${events.length})` }]} />
    {anns.length > 0 && tab === 'feed' && <div className="mt-3 flex flex-col gap-2">{anns.map(a => <div key={a.id} className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm"><b>📢 {a.title}</b>{a.body && <div className="text-zinc-500 mt-0.5">{a.body}</div>}</div>)}</div>}
    {digest && <div className="glass rounded-2xl p-4 mt-3 text-sm leading-relaxed whitespace-pre-wrap animate-[msgIn_.35s]"><b>✨ Что нового:</b><br />{digest}</div>}
    {tab === 'feed' && <div className="mt-3"><Stories /></div>}
    {tab === 'feed' && <div className="glass rounded-2xl p-4 mt-3">
      <Textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder={`Что нового, ${me.name}?`} rows={3} maxLength={2000} />
      {img && <div className="relative mt-2"><img src={img} alt="" className="rounded-xl max-h-52 w-full object-cover" /><button onClick={() => setImg('')} className="absolute top-2 right-2 size-7 grid place-items-center rounded-full bg-black/60 text-white text-sm">✕</button></div>}
      {vid && <div className="relative mt-2"><video src={vid} controls className="rounded-xl max-h-52 w-full object-cover" /><button onClick={() => setVid('')} className="absolute top-2 right-2 size-7 grid place-items-center rounded-full bg-black/60 text-white text-sm">✕</button></div>}
      <div className="flex gap-2 mt-2.5 flex-wrap">
        <DictateButton className="!size-10 !rounded-xl" onText={t => setDraft(v => (v ? v + ' ' : '') + t)} />
        <label className="size-10 grid place-items-center rounded-xl border border-zinc-200 dark:border-white/10 hover:border-blue-500 cursor-pointer transition" title="Фото/видео">
          <ImagePlus size={16} /><input type="file" accept="image/*,video/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) attach(f); e.target.value = ''; }} />
        </label>
        <Button onClick={publish} disabled={busy || (!draft.trim() && !img && !vid)}>{busy ? '…' : 'Опубликовать'}</Button>
        <Button variant="outline" onClick={aiImprove} disabled={busy || !draft.trim()}><Sparkles size={15} /> Улучшить</Button>
        <Button variant="outline" onClick={aiImage} disabled={busy || imgBusy || !draft.trim()}><Video size={15} className="hidden" /><ImagePlus size={15} /> {imgBusy ? '…' : 'AI-картинка'}</Button>
        <Button variant="outline" onClick={() => setPollOpen(true)}><BarChart3 size={15} /> Опрос</Button>
      </div>
    </div>}
    {tab === 'feed' && pollOpen && <div className="glass rounded-2xl p-4 mt-3 flex flex-col gap-2 animate-[msgIn_.35s]">
      <b className="text-sm">📊 Опрос в ленту</b>
      <input value={pollQ} onChange={e => setPollQ(e.target.value)} placeholder="Вопрос…" className="h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none font-bold" />
      {pollOpts.map((o, i) => <div key={i} className="flex gap-2">
        <input value={o} onChange={e => setPollOpts(prev => prev.map((x, j) => j === i ? e.target.value : x))} placeholder={`Вариант ${i + 1}`} className="flex-1 h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" />
        {pollOpts.length > 2 && <button onClick={() => setPollOpts(prev => prev.filter((_, j) => j !== i))} className="p-2 text-zinc-400"><X size={15} /></button>}
      </div>)}
      {pollOpts.length < 6 && <button onClick={() => setPollOpts(prev => [...prev, ''])} className="text-xs font-bold text-blue-500 self-start">＋ вариант</button>}
      <div className="flex gap-2"><Button onClick={publishPoll} disabled={busy}>Опубликовать опрос</Button><Button variant="outline" onClick={() => setPollOpen(false)}>Отмена</Button></div>
    </div>}
    {tab === 'feed' && tagView && <div className="glass rounded-2xl p-4 mt-3 animate-[msgIn_.35s]">
      <div className="flex items-center gap-2"><b className="text-sm text-blue-500">#{tagView.tag}</b><span className="text-xs text-zinc-500">· {tagView.posts.length}</span>
        <button onClick={() => setTagView(null)} className="ml-auto p-1.5 text-zinc-400"><X size={16} /></button></div>
      <div className="flex flex-col gap-2 mt-2 max-h-96 overflow-y-auto">
        {tagView.posts.map(p => <div key={p.id} className="rounded-xl bg-zinc-100 dark:bg-white/5 p-3 text-sm">
          <b>{profs[p.author_id]?.name || '…'} </b><span className="text-zinc-500 text-xs">{timeAgo(p.created_at)}</span>
          <p className="mt-0.5 whitespace-pre-wrap">{p.text.slice(0, 300)}</p>
          {p.image_url && <img src={p.image_url} alt="" className="mt-1.5 rounded-lg max-h-40 object-cover" />}
        </div>)}
        {tagView.posts.length === 0 && !tagView.done && <div className="text-sm text-zinc-500 text-center py-3">Ищу по релеям…</div>}
        {tagView.posts.length === 0 && tagView.done && <div className="text-sm text-zinc-500 text-center py-3">Ничего не найдено <button onClick={() => openTag(tagView.tag)} className="text-blue-500 font-bold">↻ Повторить</button></div>}
      </div>
    </div>}
    {tab === 'feed' && <div ref={anim} className="flex flex-col gap-3 mt-3 pb-10">
      {loading && <div className="text-sm text-zinc-500 text-center py-4 animate-pulse">Загружаю ленту с релеев…</div>}
      {!loading && posts.length === 0 && <Empty icon="📰" title="Пока пусто" sub="Стань первым — напиши пост выше" />}
      {posts.map(p => <motion.article key={p.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2.5">
          <Link href={`/profile?id=${p.author_id}`}><Avatar src={profs[p.author_id]?.avatar_url} name={profs[p.author_id]?.name || '?'} size={42} /></Link>
          <div className="flex-1 min-w-0"><Link href={`/profile?id=${p.author_id}`} className="font-bold text-sm flex items-center gap-1 hover:underline">{profs[p.author_id]?.name || '…'} {profs[p.author_id]?.verified && <BadgeCheck size={15} className="text-blue-500" />}</Link>
            <div className="text-[11px] text-zinc-500">{timeAgo(p.created_at)}</div></div>
          {(me.id === p.author_id || me.role === 'admin') && <button onClick={() => remove(p)} className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 size={15} /></button>}
          {me.id !== p.author_id && <button onClick={() => report(p)} className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-500 hover:bg-amber-500/10"><Flag size={15} /></button>}
        </div>
        <PostBody p={p} votes={feedVotes[p.id]} onVote={(i) => votePoll(p.id, i).then(() => getPollVotes(p.id).then(v => setFeedVotes(prev => ({ ...prev, [p.id]: v })))).catch(() => {})} onTag={openTag} translation={trans[p.id]} />
        {p.image_url && <img src={p.image_url} alt="" className="mt-2.5 rounded-xl max-h-80 w-full object-cover" />}
        {p.video_url && <video src={p.video_url} controls className="mt-2.5 rounded-xl max-h-80 w-full object-cover" />}
        <div className="flex gap-1 mt-3">
          <button onClick={() => like(p)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition active:scale-90 ${p.liked ? 'text-rose-500 bg-rose-500/10' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5'}`}><Heart size={16} fill={p.liked ? 'currentColor' : 'none'} />{p.likes}</button>
          <button onClick={() => loadComments(p.id)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5 transition"><MessageCircle size={16} />{p.comments}</button>
          <button onClick={() => repost(p)} disabled={p.reposted} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition ${p.reposted ? 'text-emerald-500' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5'}`}><Repeat2 size={16} />{p.reposts}</button>
          {!parsePoll(p) && <button onClick={() => translatePost(p)} title="Перевести" className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5 transition"><Languages size={16} /></button>}
          <Link href={`/messages?dm=${p.author_id}`} className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5">Написать</Link>
        </div>
        {openComments === p.id && <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-white/10 flex flex-col gap-2">
          {comments.map(c => <div key={c.id} className="flex gap-2"><Avatar src={profs[c.author_id]?.avatar_url} name={profs[c.author_id]?.name || '?'} size={28} /><div className="rounded-xl bg-zinc-100 dark:bg-white/5 px-3 py-1.5 text-sm"><b>{profs[c.author_id]?.name || '…'}</b> {c.text}</div></div>)}
          <div className="flex gap-2"><input value={cDraft} onChange={e => setCDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendComment()} placeholder="Комментарий…" className="flex-1 h-9 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none focus:border-blue-500" /><Button size="sm" onClick={sendComment}>OK</Button></div>
        </div>}
      </motion.article>)}
    </div>}
    {tab === 'events' && <div className="mt-3 pb-10">
      <Button size="sm" onClick={() => setEvForm(!evForm)}><CalendarPlus size={14} /> Создать событие</Button>
      {evForm && <div className="glass rounded-2xl p-4 mt-2 flex flex-col gap-2">
        <input value={ev.title} onChange={e => setEv({ ...ev, title: e.target.value })} placeholder="Название" className="h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none font-bold" />
        <div className="grid grid-cols-2 gap-2">
          <input value={ev.at} onChange={e => setEv({ ...ev, at: e.target.value })} placeholder="Когда (напр. 20 сен 19:00)" className="h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" />
          <input value={ev.place} onChange={e => setEv({ ...ev, place: e.target.value })} placeholder="Где" className="h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" />
        </div>
        <textarea value={ev.about} onChange={e => setEv({ ...ev, about: e.target.value })} placeholder="О событии…" rows={2} className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm outline-none" />
        <Button onClick={createEvent}>Опубликовать событие</Button>
      </div>}
      <div className="flex flex-col gap-2.5 mt-3">
        {events.length === 0 && <Empty icon="📅" title="Событий пока нет" sub="Создай встречу, эфир или сходку" />}
        {events.map(e => <div key={e.id} className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2"><b>📅 {e.title}</b>
            <span className="ml-auto text-xs font-bold text-emerald-500">идут: {e.going}</span></div>
          <div className="text-[13px] text-zinc-500 mt-1 flex gap-3 flex-wrap"><span>🕖 {e.at || '—'}</span><span className="flex items-center gap-1"><MapPin size={13} />{e.place || '—'}</span></div>
          {e.about && <p className="text-sm mt-1.5">{e.about}</p>}
          <div className="flex gap-2 mt-2.5">
            <Button size="sm" variant={e.meGoing ? 'outline' : 'default'} onClick={() => rsvpEvent(e.id).then(() => setEvents(events.map(x => x.id === e.id ? { ...x, going: x.going + (x.meGoing ? 0 : 1), meGoing: true } : x))).catch(() => {})}>{e.meGoing ? '✓ Ты идёшь' : 'Я пойду'}</Button>
            <span className="text-[11px] text-zinc-400 self-center">от {profs[e.author_id]?.name || '…'}</span>
          </div>
        </div>)}
      </div>
    </div>}
  </div>;
}
