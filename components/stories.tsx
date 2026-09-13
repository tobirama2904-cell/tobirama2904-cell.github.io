'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X, Trash2, ImagePlus } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Avatar } from './ui/primitives';
import { getStories, publishStory, getProfile, deletePost } from '@/lib/hybrid/social';
import { uploadFile } from '@/lib/hybrid/storage';
import type { Story, Profile } from '@/lib/supabase/types';

export function Stories() {
  const me = useStore(s => s.me);
  const [stories, setStories] = useState<Story[]>([]);
  const [profs, setProfs] = useState<Record<string, Profile>>({});
  const [view, setView] = useState<Story | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  useEffect(() => {
    if (!me || me.guest) return;
    getStories().then(async ss => {
      setStories(ss);
      const ids = [...new Set(ss.map(s => s.author_id))];
      const rows = await Promise.all(ids.slice(0, 30).map(id => getProfile(id).catch(() => null)));
      const m: Record<string, Profile> = {};
      rows.forEach(p => { if (p) m[p.id] = p; });
      setProfs(m);
    }).catch(() => {});
  }, [me]);
  const add = async (image?: string | null) => {
    if (!me || me.guest || (!draft.trim() && !image)) return;
    setAdding(true);
    try {
      const s = await publishStory(draft.trim() || '📸', image || null);
      if (s) { setStories(prev => [s, ...prev]); setDraft(''); }
    } catch {}
    setAdding(false);
  };
  const addPhoto = async (f: File) => {
    if (!me || me.guest) return;
    setImgBusy(true);
    try {
      const url = await uploadFile(f);
      await add(url);
    } catch { alert('Загрузка не удалась'); }
    setImgBusy(false);
  };
  const del = async (s: Story) => {
    if (!confirm('Удалить историю?')) return;
    try { await deletePost(s.id); } catch {}
    setStories(prev => prev.filter(x => x.id !== s.id));
    setView(null);
  };
  const groups = new Map<string, Story[]>();
  stories.forEach(s => { const a = groups.get(s.author_id) || []; a.push(s); groups.set(s.author_id, a); });
  if (!me || me.guest) return null;
  return <div>
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
      <div className="flex flex-col items-center gap-1 shrink-0">
        <div className="flex gap-1 items-center">
          <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Story…" maxLength={120} className="w-24 text-xs rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1.5 outline-none" />
          <button onClick={() => add()} disabled={adding || !draft.trim()} title="Опубликовать" className="size-8 grid place-items-center rounded-full bg-blue-600 text-white disabled:opacity-40"><Plus size={15} /></button>
          <label title="Фото-история" className="size-8 grid place-items-center rounded-full border border-zinc-200 dark:border-white/10 cursor-pointer hover:border-blue-500">
            {imgBusy ? <span className="text-xs animate-pulse">…</span> : <ImagePlus size={15} />}
            <input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.target.value = ''; }} />
          </label>
        </div>
        <span className="text-[10px] font-bold text-zinc-500">Твоя · 24ч</span>
      </div>
      {[...groups.entries()].map(([uid, arr]) => <button key={uid} onClick={() => setView(arr[0])} className="flex flex-col items-center gap-1 shrink-0">
        <div className="rounded-full p-[2.5px] bg-gradient-to-tr from-amber-400 via-rose-500 to-violet-500"><div className="rounded-full p-[2px] bg-white dark:bg-zinc-950"><Avatar src={profs[uid]?.avatar_url} name={profs[uid]?.name || '?'} size={52} /></div></div>
        <span className="text-[10px] font-bold text-zinc-500 max-w-16 truncate">{profs[uid]?.name || '?'}{arr.length > 1 ? ` (${arr.length})` : ''}</span>
      </button>)}
    </div>
    <AnimatePresence>
      {view && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-black/90 grid place-items-center p-4" onClick={() => setView(null)}>
        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="relative w-full max-w-sm aspect-[9/14] rounded-3xl overflow-hidden bg-gradient-to-br from-violet-600 via-blue-600 to-cyan-500 grid place-items-center p-8 text-center" onClick={e => e.stopPropagation()}>
          {view.image_url && <img src={view.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          {view.image_url && <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />}
          {view.video_url && <video src={view.video_url} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover" />}
          <button onClick={() => setView(null)} className="absolute top-4 right-4 text-white/80 z-10"><X /></button>
          {me.id === view.author_id && <button onClick={() => del(view)} className="absolute top-4 left-4 text-white/80 z-10" title="Удалить"><Trash2 size={18} /></button>}
          <div className="relative z-10">
            <Avatar src={profs[view.author_id]?.avatar_url} name={profs[view.author_id]?.name || '?'} size={56} />
            <div className="text-white font-bold mt-2">{profs[view.author_id]?.name}</div>
            <p className="text-white text-xl font-bold mt-4 leading-snug">{view.text}</p>
          </div>
        </motion.div>
      </motion.div>}
    </AnimatePresence>
  </div>;
}
