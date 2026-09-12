'use client';
import { useEffect, useState } from 'react';
import { Plus, Cloud, CloudOff, Sparkles } from 'lucide-react';
import { supaBrowser, isCloud } from '@/lib/supabase/client';
import { useStore } from '@/lib/store';
import { Button, Empty } from '@/components/ui/primitives';
import type { AiMemory } from '@/lib/supabase/types';

const KINDS = [['fact', '🧠 Факты'], ['pref', '⭐ Вкусы'], ['project', '📌 Проекты'], ['episode', '🕰 События']] as const;
export default function MemoryPage() {
  const me = useStore(s => s.me);
  const cloud = isCloud() && me && !me.guest;
  const [items, setItems] = useState<AiMemory[]>([]);
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<string>('fact');
  const [q, setQ] = useState('');
  const load = async () => {
    if (!cloud) {
      try { setItems(JSON.parse(localStorage.getItem('legion-mem-local') || '[]')); } catch { setItems([]); }
      return;
    }
    const { data } = await supaBrowser().from('ai_memories').select('*').eq('user_id', me!.id).order('created_at', { ascending: false }).limit(200);
    setItems((data || []) as never[]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [cloud]);
  const add = async () => {
    if (!draft.trim()) return;
    const row = { kind, key: '', value: draft.trim().slice(0, 500) };
    if (!cloud) {
      const all = [{ ...row, id: Math.random().toString(36).slice(2), user_id: 'guest', created_at: new Date().toISOString() }, ...items];
      try { localStorage.setItem('legion-mem-local', JSON.stringify(all)); } catch {}
      setItems(all as never[]); setDraft(''); return;
    }
    await supaBrowser().from('ai_memories').insert({ ...row, user_id: me!.id });
    setDraft(''); load();
  };
  const del = async (id: string) => {
    if (!cloud) { const all = items.filter(i => i.id !== id); try { localStorage.setItem('legion-mem-local', JSON.stringify(all)); } catch {} setItems(all); return; }
    await supaBrowser().from('ai_memories').delete().eq('id', id); load();
  };
  const extract = async () => {
    const text = prompt('Вставь текст для извлечения фактов (или расскажи о себе):');
    if (!text) return;
    let key = ''; try { key = localStorage.getItem('legion-agnes-key') || ''; } catch {}
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key || undefined, system: 'Извлеки долговременные факты. СТРОГО JSON: {"facts":[],"prefs":{},"projects":[]}. Только JSON.', prompt: text.slice(0, 3000) }) });
    try {
      const j = JSON.parse((await r.json()).text.replace(/```json|```/g, '').trim());
      const rows = [...(j.facts || []).map((v: string) => ({ kind: 'fact', value: v })), ...Object.entries(j.prefs || {}).map(([k, v]) => ({ kind: 'pref', key: k, value: String(v) })), ...(j.projects || []).map((p: { name: string }) => ({ kind: 'project', value: p.name || p }))];
      for (const row of rows.slice(0, 10)) {
        if (!cloud) { const all = [{ ...row, key: row.key || '', id: Math.random().toString(36).slice(2), user_id: 'guest', created_at: new Date().toISOString() }, ...items]; try { localStorage.setItem('legion-mem-local', JSON.stringify(all)); } catch {} setItems(all as never[]); }
        else await supaBrowser().from('ai_memories').insert({ ...row, key: row.key || '', user_id: me!.id });
      }
      load();
    } catch { alert('Не удалось извлечь (нужен Agnes-ключ)'); }
  };
  const f = q.toLowerCase();
  return <div className="max-w-4xl mx-auto">
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <h1 className="font-display font-bold text-xl">Память</h1>
      <span className={`text-xs font-bold flex items-center gap-1 px-2.5 py-1 rounded-full ${cloud ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-500/10 text-zinc-500'}`}>{cloud ? <><Cloud size={13} /> облако</> : <><CloudOff size={13} /> локально</>}</span>
      <div className="ml-auto flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Поиск…" className="h-9 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none w-40" />
        <Button size="sm" variant="outline" onClick={extract}><Sparkles size={14} /> Извлечь AI</Button>
      </div>
    </div>
    <div className="glass rounded-2xl p-3 flex gap-2">
      <select value={kind} onChange={e => setKind(e.target.value)} className="h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 text-sm font-bold outline-none">
        {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Запомни: …" className="flex-1 h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" />
      <Button onClick={add}><Plus size={15} /></Button>
    </div>
    <div className="grid sm:grid-cols-2 gap-3 mt-3">
      {KINDS.map(([kv, label]) => {
        const list = items.filter(i => i.kind === kv && (!f || (i.value + i.key).toLowerCase().includes(f)));
        return <div key={kv} className="glass rounded-2xl p-3.5">
          <b className="text-xs font-display tracking-wider text-blue-500">{label}</b>
          <div className="flex flex-col gap-1.5 mt-2">
            {list.length === 0 && <div className="text-xs text-zinc-400 italic">Пусто</div>}
            {list.map(i => <div key={i.id} className="group flex items-center gap-2 rounded-xl bg-zinc-100 dark:bg-white/5 px-3 py-2 text-[13px] font-medium animate-[msgIn_.3s]">
              <span className="flex-1">{i.key ? <b>{i.key}: </b> : ''}{i.value}</span>
              <button onClick={() => del(i.id)} className="opacity-0 group-hover:opacity-100 text-rose-500 font-bold">✕</button>
            </div>)}
          </div>
        </div>;
      })}
    </div>
    {items.length === 0 && <div className="mt-3"><Empty icon="🧠" title="Память пуста" sub="Добавь факт выше или извлеки из текста кнопкой AI" /></div>}
  </div>;
}
