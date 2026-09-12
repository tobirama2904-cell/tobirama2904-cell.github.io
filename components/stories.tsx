'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import { supaBrowser, isCloud } from '@/lib/supabase/client';
import { useStore } from '@/lib/store';
import { Avatar } from './ui/primitives';
import type { Story } from '@/lib/supabase/types';

export function Stories() {
  const me = useStore(s => s.me);
  const [stories, setStories] = useState<Story[]>([]);
  const [view, setView] = useState<Story | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (!isCloud()) return;
    supaBrowser().from('stories').select('*,author:profiles!stories_author_id_fkey(*)').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(30).then(({ data }) => setStories((data || []) as never[]));
  }, []);
  const add = async () => {
    if (!me || me.guest || !draft.trim()) return;
    setAdding(true);
    const { data } = await supaBrowser().from('stories').insert({ author_id: me.id, text: draft.trim() }).select('*,author:profiles!stories_author_id_fkey(*)').single();
    setAdding(false);
    if (data) { setStories([data as never, ...stories]); setDraft(''); }
  };
  const groups = new Map<string, Story[]>();
  stories.forEach(s => { const a = groups.get(s.author_id) || []; a.push(s); groups.set(s.author_id, a); });
  return <div>
    <div className="flex gap-3 overflow-x-auto pb-1">
      {me && !me.guest && <div className="flex flex-col items-center gap-1 shrink-0">
        <div className="flex gap-1">
          <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Story…" maxLength={120} className="w-24 text-xs rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1 outline-none" />
          <button onClick={add} disabled={adding || !draft.trim()} className="size-8 grid place-items-center rounded-full bg-blue-600 text-white"><Plus size={15} /></button>
        </div>
        <span className="text-[10px] font-bold text-zinc-500">Твоя</span>
      </div>}
      {[...groups.entries()].map(([uid, arr]) => <button key={uid} onClick={() => setView(arr[0])} className="flex flex-col items-center gap-1 shrink-0">
        <div className="rounded-full p-[2.5px] bg-gradient-to-tr from-amber-400 via-rose-500 to-violet-500"><div className="rounded-full p-[2px] bg-white dark:bg-zinc-950"><Avatar src={arr[0].author?.avatar_url} name={arr[0].author?.name || '?'} size={52} /></div></div>
        <span className="text-[10px] font-bold text-zinc-500 max-w-16 truncate">{arr[0].author?.name}</span>
      </button>)}
    </div>
    <AnimatePresence>
      {view && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-black/90 grid place-items-center p-4" onClick={() => setView(null)}>
        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="relative w-full max-w-sm aspect-[9/14] rounded-3xl bg-gradient-to-br from-violet-600 via-blue-600 to-cyan-500 grid place-items-center p-8 text-center" onClick={e => e.stopPropagation()}>
          <button onClick={() => setView(null)} className="absolute top-4 right-4 text-white/80"><X /></button>
          <div>
            <Avatar src={view.author?.avatar_url} name={view.author?.name || '?'} size={56} />
            <div className="text-white font-bold mt-2">{view.author?.name}</div>
            <p className="text-white text-xl font-bold mt-4 leading-snug">{view.text}</p>
          </div>
        </motion.div>
      </motion.div>}
    </AnimatePresence>
  </div>;
}
