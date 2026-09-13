'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Heart, MessageCircle, Plus, Repeat2, Share2, Send, Eye, Volume2, VolumeX, UserPlus, UserMinus, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Avatar, Empty } from '@/components/ui/primitives';
import { timeAgo } from '@/lib/utils';
import { getPosts, setLike, getProfile, getComments, publishComment, publishRepost, setFollow, getFollowing, publishView, getViews } from '@/lib/hybrid/social';
import type { Post, Profile, Comment } from '@/lib/supabase/types';

function ClipsInner() {
  const me = useStore(s => s.me);
  const logged = me && !me.guest;
  const params = useSearchParams();
  const [clips, setClips] = useState<Post[]>([]);
  const [profs, setProfs] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(true);
  const [following, setFollowing] = useState<string[]>([]);
  const [views, setViews] = useState<Record<string, number>>({});
  const [cOpen, setCOpen] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [cDraft, setCDraft] = useState('');
  const [cBusy, setCBusy] = useState(false);
  const [burst, setBurst] = useState<string | null>(null);
  const [prog, setProg] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const seenViews = useRef<Set<string>>(new Set());

  useEffect(() => { try { setMuted(localStorage.getItem('legion-clips-muted') !== '0'); } catch {} }, []);
  useEffect(() => {
    if (!logged) { setLoading(false); return; }
    getPosts({ limit: 60 }).then(async ps => {
      const vids = ps.filter(p => p.video_url);
      setClips(vids);
      const ids = [...new Set(vids.map(p => p.author_id))];
      const rows = await Promise.all(ids.slice(0, 40).map(id => getProfile(id).catch(() => null)));
      const m: Record<string, Profile> = {};
      rows.forEach(p => { if (p) m[p.id] = p; });
      setProfs(m);
      if (me) getFollowing(me.id).then(f => setFollowing(f)).catch(() => {});
      setLoading(false);
      const deep = params.get('clip');
      if (deep) setTimeout(() => { try { document.getElementById('clip-' + deep)?.scrollIntoView({ block: 'center' }); } catch {} }, 600);
    }).catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logged]);
  // autoplay visible clip + views, pause others
  useEffect(() => {
    const els = wrapRef.current?.querySelectorAll('video');
    if (!els) return;
    const io = new IntersectionObserver(es => {
      es.forEach(e => {
        const v = e.target as HTMLVideoElement;
        const id = v.dataset.cid || '';
        if (e.isIntersecting && e.intersectionRatio > 0.6) {
          v.play().catch(() => {});
          if (id && !seenViews.current.has(id)) {
            seenViews.current.add(id);
            publishView(id);
            getViews(id).then(n => setViews(prev => ({ ...prev, [id]: n }))).catch(() => {});
          }
        } else v.pause();
      });
    }, { threshold: [0.6] });
    els.forEach(v => io.observe(v));
    return () => io.disconnect();
  }, [clips]);
  useEffect(() => {
    wrapRef.current?.querySelectorAll('video').forEach(v => { (v as HTMLVideoElement).muted = muted; });
    try { localStorage.setItem('legion-clips-muted', muted ? '1' : '0'); } catch {}
  }, [muted]);

  const like = async (p: Post) => {
    const on = !p.liked;
    setClips(cs => cs.map(x => x.id === p.id ? { ...x, likes: x.likes + (on ? 1 : -1), liked: on } : x));
    await setLike(p.id, p.author_id, on).catch(() => {});
  };
  const dbl = (p: Post) => {
    if (!p.liked) like(p);
    setBurst(p.id);
    setTimeout(() => setBurst(b => (b === p.id ? null : b)), 700);
  };
  const openComments = async (p: Post) => {
    setCOpen(p.id);
    setComments([]);
    getComments(p.id).then(cs => setComments(cs)).catch(() => {});
  };
  const sendComment = async () => {
    if (!cOpen || !cDraft.trim() || cBusy) return;
    const clip = clips.find(c => c.id === cOpen);
    if (!clip) return;
    setCBusy(true);
    const c = await publishComment(cOpen, clip.author_id, cDraft.trim()).catch(() => null);
    if (c) {
      setComments(prev => [...prev, c]);
      setClips(cs => cs.map(x => x.id === cOpen ? { ...x, comments: x.comments + 1 } : x));
      setCDraft('');
    }
    setCBusy(false);
  };
  const repost = async (p: Post) => {
    if (!logged || p.reposted) return;
    await publishRepost(p.id, p.author_id).catch(() => {});
    setClips(cs => cs.map(x => x.id === p.id ? { ...x, reposts: (x.reposts || 0) + 1, reposted: true } : x));
  };
  const share = async (p: Post) => {
    const url = (typeof location !== 'undefined' ? location.origin : 'https://tobirama2904-cell.github.io') + '/clips?clip=' + p.id;
    try { await navigator.clipboard.writeText(url); setCopied(p.id); setTimeout(() => setCopied(''), 1800); }
    catch { prompt('Скопируй ссылку на клип:', url); }
  };
  const toggleFollow = async (p: Post) => {
    const on = !following.includes(p.author_id);
    await setFollow(p.author_id, on).catch(() => {});
    setFollowing(f => (on ? [...f, p.author_id] : f.filter(x => x !== p.author_id)));
  };

  if (!me) return <Empty icon="…" title="Загрузка…" />;
  if (!logged) return <div className="max-w-md mx-auto"><Empty icon="🎬" title="Войди, чтобы смотреть клипы" /></div>;
  return <div className="max-w-md mx-auto">
    <div className="flex items-center gap-2 mb-3">
      <h1 className="font-display font-bold text-xl">Клипы</h1>
      <button onClick={() => setMuted(!muted)} className="size-9 grid place-items-center rounded-xl border border-zinc-200 dark:border-white/10" title="Звук">{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
      <Link href="/create" className="ml-auto flex items-center gap-1.5 text-xs font-bold bg-blue-600 text-white rounded-xl px-3.5 py-2"><Plus size={14} /> Снять клип</Link>
    </div>
    {loading && <div className="text-sm text-zinc-500 text-center py-6 animate-pulse">Загружаю клипы…</div>}
    {!loading && clips.length === 0 && <Empty icon="🎬" title="Клипов пока нет" sub="Стань первым — сними видео через «Создать»" />}
    <div ref={wrapRef} className="flex flex-col gap-4 pb-10 max-h-[calc(100dvh-14rem)] lg:max-h-[calc(100vh-10rem)] overflow-y-auto snap-y snap-mandatory clips-scroll rounded-3xl">
      {clips.map(c => <div key={c.id} id={'clip-' + c.id} className="snap-start snap-always relative rounded-3xl overflow-hidden bg-black shrink-0">
        <video data-cid={c.id} src={c.video_url!} playsInline loop muted={muted} controls={false} preload="metadata" className="w-full aspect-[9/14] max-h-[62vh] object-contain bg-black"
          onClick={e => { const v = e.currentTarget; if (v.paused) v.play().catch(() => {}); else v.pause(); }}
          onDoubleClick={() => dbl(c)}
          onTimeUpdate={e => { const v = e.currentTarget; if (v.duration) setProg(prev => ({ ...prev, [c.id]: (v.currentTime / v.duration) * 100 })); }} />
        <div className="absolute top-0 inset-x-0 h-1 bg-white/20"><div className="h-full bg-blue-500 transition-[width]" style={{ width: (prog[c.id] || 0) + '%' }} /></div>
        {burst === c.id && <div className="absolute inset-0 grid place-items-center pointer-events-none"><Heart size={90} className="text-rose-500 animate-ping" fill="currentColor" /></div>}
        <div className="absolute inset-x-0 bottom-0 p-4 pr-16 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            <Link href={`/profile?id=${c.author_id}`} className="flex items-center gap-2 min-w-0">
              <Avatar src={profs[c.author_id]?.avatar_url} name={profs[c.author_id]?.name || '?'} size={36} />
              <b className="text-white text-sm truncate">{profs[c.author_id]?.name || '…'}</b>
            </Link>
            {me.id !== c.author_id && <button onClick={() => toggleFollow(c)} className="text-[11px] font-bold text-white border border-white/50 rounded-full px-2.5 py-1 shrink-0">{following.includes(c.author_id) ? 'Читаю ✓' : '+ Читать'}</button>}
          </div>
          {c.text && <p className="text-white text-sm mt-1.5 line-clamp-2">{c.text}</p>}
          <div className="text-white/60 text-[11px] mt-1 flex items-center gap-2"><span className="flex items-center gap-1"><Eye size={12} /> {views[c.id] ?? '…'}</span>· {timeAgo(c.created_at)}</div>
        </div>
        <div className="absolute right-2.5 bottom-24 flex flex-col gap-3">
          <button onClick={() => like(c)} className="flex flex-col items-center gap-0.5 text-white">
            <span className={`size-11 grid place-items-center rounded-full ${c.liked ? 'bg-rose-500' : 'bg-white/20 backdrop-blur'}`}><Heart size={20} fill={c.liked ? 'currentColor' : 'none'} /></span>
            <span className="text-[11px] font-bold">{c.likes}</span>
          </button>
          <button onClick={() => openComments(c)} className="flex flex-col items-center gap-0.5 text-white">
            <span className="size-11 grid place-items-center rounded-full bg-white/20 backdrop-blur"><MessageCircle size={20} /></span>
            <span className="text-[11px] font-bold">{c.comments}</span>
          </button>
          <button onClick={() => repost(c)} className={`flex flex-col items-center gap-0.5 ${c.reposted ? 'text-emerald-400' : 'text-white'}`}>
            <span className={`size-11 grid place-items-center rounded-full ${c.reposted ? 'bg-emerald-500' : 'bg-white/20 backdrop-blur'}`}><Repeat2 size={20} /></span>
            <span className="text-[11px] font-bold">{c.reposts || ''}</span>
          </button>
          <button onClick={() => share(c)} className="flex flex-col items-center gap-0.5 text-white">
            <span className="size-11 grid place-items-center rounded-full bg-white/20 backdrop-blur"><Share2 size={20} /></span>
            <span className="text-[11px] font-bold">{copied === c.id ? '✓' : ''}</span>
          </button>
          {me.id !== c.author_id && <Link href={`/messages?dm=${c.author_id}`} className="flex flex-col items-center gap-0.5 text-white">
            <span className="size-11 grid place-items-center rounded-full bg-white/20 backdrop-blur"><Send size={20} /></span>
          </Link>}
        </div>
      </div>)}
    </div>
    {cOpen && <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setCOpen(null)}>
      <div className="w-full sm:max-w-md bg-white dark:bg-zinc-950 rounded-t-3xl sm:rounded-3xl p-4 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center mb-2"><b>Комментарии · {comments.length}</b><button onClick={() => setCOpen(null)} className="ml-auto p-2"><X size={18} /></button></div>
        <div className="flex-1 overflow-y-auto flex flex-col gap-2 mb-2">
          {comments.map(cm => <div key={cm.id} className="rounded-xl bg-zinc-100 dark:bg-white/5 px-3 py-2 text-sm"><b className="text-xs">{profs[cm.author_id]?.name || cm.author_id.slice(0, 8)}</b> {cm.text}</div>)}
          {comments.length === 0 && <div className="text-sm text-zinc-500 text-center py-6">Пока тихо — стань первым</div>}
        </div>
        <div className="flex gap-2">
          <input value={cDraft} onChange={e => setCDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendComment()} placeholder="Комментарий…" className="flex-1 h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" />
          <button onClick={sendComment} disabled={cBusy || !cDraft.trim()} className="size-10 grid place-items-center rounded-xl bg-blue-600 text-white disabled:opacity-50"><Send size={16} /></button>
        </div>
      </div>
    </div>}
  </div>;
}

export default function ClipsPage() {
  return <Suspense><ClipsInner /></Suspense>;
}
