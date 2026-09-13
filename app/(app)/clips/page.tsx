'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Heart, MessageCircle, Plus } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Avatar, Empty } from '@/components/ui/primitives';
import { timeAgo } from '@/lib/utils';
import { getPosts, setLike, getProfile } from '@/lib/hybrid/social';
import type { Post, Profile } from '@/lib/supabase/types';

export default function ClipsPage() {
  const me = useStore(s => s.me);
  const logged = me && !me.guest;
  const [clips, setClips] = useState<Post[]>([]);
  const [profs, setProfs] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);

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
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [logged]);
  // autoplay visible clip, pause others
  useEffect(() => {
    const els = wrapRef.current?.querySelectorAll('video');
    if (!els) return;
    const io = new IntersectionObserver(es => {
      es.forEach(e => {
        const v = e.target as HTMLVideoElement;
        if (e.isIntersecting && e.intersectionRatio > 0.6) v.play().catch(() => {});
        else v.pause();
      });
    }, { threshold: [0.6] });
    els.forEach(v => io.observe(v));
    return () => io.disconnect();
  }, [clips]);

  const like = async (p: Post) => {
    const on = !p.liked;
    setClips(cs => cs.map(x => x.id === p.id ? { ...x, likes: x.likes + (on ? 1 : -1), liked: on } : x));
    await setLike(p.id, p.author_id, on).catch(() => {});
  };

  if (!me) return <Empty icon="…" title="Загрузка…" />;
  if (!logged) return <div className="max-w-md mx-auto"><Empty icon="🎬" title="Войди, чтобы смотреть клипы" /></div>;
  return <div className="max-w-md mx-auto">
    <div className="flex items-center gap-2 mb-3">
      <h1 className="font-display font-bold text-xl">Клипы</h1>
      <Link href="/create" className="ml-auto flex items-center gap-1.5 text-xs font-bold bg-blue-600 text-white rounded-xl px-3.5 py-2"><Plus size={14} /> Снять клип</Link>
    </div>
    {loading && <div className="text-sm text-zinc-500 text-center py-6 animate-pulse">Загружаю клипы…</div>}
    {!loading && clips.length === 0 && <Empty icon="🎬" title="Клипов пока нет" sub="Стань первым — сними видео через «Создать»" />}
    <div ref={wrapRef} className="flex flex-col gap-4 pb-10 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto lg:snap-y lg:snap-mandatory clips-scroll">
      {clips.map(c => <div key={c.id} className="lg:snap-start relative rounded-3xl overflow-hidden bg-black shrink-0">
        <video src={c.video_url!} playsInline loop muted controls={false} preload="metadata" className="w-full aspect-[9/14] max-h-[70vh] object-contain" onClick={e => { const v = e.currentTarget; v.muted = !v.muted; v.play().catch(() => {}); }} />
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
          <Link href={`/profile?id=${c.author_id}`} className="flex items-center gap-2 pointer-events-auto">
            <Avatar src={profs[c.author_id]?.avatar_url} name={profs[c.author_id]?.name || '?'} size={36} />
            <b className="text-white text-sm">{profs[c.author_id]?.name || '…'}</b>
            <span className="text-white/60 text-xs">{timeAgo(c.created_at)}</span>
          </Link>
          {c.text && <p className="text-white text-sm mt-1.5 line-clamp-2">{c.text}</p>}
        </div>
        <div className="absolute right-2.5 bottom-20 flex flex-col gap-3">
          <button onClick={() => like(c)} className="flex flex-col items-center gap-0.5 text-white">
            <span className={`size-11 grid place-items-center rounded-full ${c.liked ? 'bg-rose-500' : 'bg-white/20 backdrop-blur'}`}><Heart size={20} fill={c.liked ? 'currentColor' : 'none'} /></span>
            <span className="text-[11px] font-bold">{c.likes}</span>
          </button>
          <Link href="/feed" className="flex flex-col items-center gap-0.5 text-white">
            <span className="size-11 grid place-items-center rounded-full bg-white/20 backdrop-blur"><MessageCircle size={20} /></span>
            <span className="text-[11px] font-bold">{c.comments}</span>
          </Link>
        </div>
        <div className="absolute top-3 left-3 text-[10px] font-bold text-white/70 bg-black/40 rounded-full px-2.5 py-1">🔊 нажми по видео — звук</div>
      </div>)}
    </div>
  </div>;
}
