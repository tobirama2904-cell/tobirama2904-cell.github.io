'use client';
import { useEffect, useState } from 'react';
import { Bot as BotIcon, Plus, Send } from 'lucide-react';
import { supaBrowser, isCloud } from '@/lib/supabase/client';
import { useStore } from '@/lib/store';
import { Avatar, Button, Empty } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/overlays';
import type { Bot } from '@/lib/supabase/types';

export default function BotsPage() {
  const me = useStore(s => s.me);
  const cloud = isCloud() && me && !me.guest;
  const [bots, setBots] = useState<Bot[]>([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: '', persona: '', system: '' });
  const [talk, setTalk] = useState<Bot | null>(null);
  const [msgs, setMsgs] = useState<{ r: string; t: string }[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    if (!cloud) return;
    const { data } = await supaBrowser().from('bots').select('*,owner:profiles!bots_owner_id_fkey(*)').eq('is_public', true).order('uses', { ascending: false }).limit(30);
    setBots((data || []) as never[]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [cloud]);
  const create = async () => {
    if (!form.name.trim() || !cloud || !me) return;
    await supaBrowser().from('bots').insert({ owner_id: me.id, name: form.name.trim(), persona: form.persona, system: form.system || `Ты ${form.name}. Отвечай в этом образе, по-русски.` });
    setForm({ name: '', persona: '', system: '' }); setShow(false); load();
  };
  const ask = async () => {
    if (!input.trim() || !talk || busy) return;
    const q = input.trim(); setInput(''); setMsgs(m => [...m, { r: 'user', t: q }]); setBusy(true);
    try {
      let key = ''; try { key = localStorage.getItem('legion-agnes-key') || ''; } catch {}
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key || undefined, system: talk.system, prompt: q }) });
      const j = await r.json();
      setMsgs(m => [...m, { r: 'bot', t: j.text || '…' }]);
      if (cloud) await supaBrowser().from('bots').update({ uses: (talk.uses || 0) + 1 }).eq('id', talk.id);
    } catch { setMsgs(m => [...m, { r: 'bot', t: '⚠ Ошибка (нужен Agnes-ключ)' }]); }
    setBusy(false);
  };
  if (!cloud) return <div className="max-w-3xl mx-auto"><h1 className="font-display font-bold text-xl mb-3">AI-Боты</h1><Empty icon="🤖" title="Боты живут в облаке" sub="Войди — и создавай своих персонажей" /></div>;
  return <div className="max-w-3xl mx-auto">
    <div className="flex items-center gap-2 mb-3">
      <h1 className="font-display font-bold text-xl">AI-Боты</h1>
      <Button size="sm" className="ml-auto" onClick={() => setShow(true)}><Plus size={14} /> Создать бота</Button>
    </div>
    <div className="grid sm:grid-cols-2 gap-3">
      {bots.map(b => <div key={b.id} className="glass rounded-2xl p-4 card-hover cursor-pointer" onClick={() => { setTalk(b); setMsgs([]); }}>
        <div className="flex items-center gap-2.5"><Avatar src={b.avatar_url} name={b.name} size={44} />
          <div><b className="text-sm">{b.name}</b><div className="text-[11px] text-zinc-500">от {b.owner?.name} · {b.uses} диалогов</div></div></div>
        <p className="text-[13px] text-zinc-500 mt-2 clamp-2">{b.persona || 'Без описания'}</p>
      </div>)}
      {bots.length === 0 && <div className="sm:col-span-2"><Empty icon="🤖" title="Ботов пока нет" sub="Создай первого!" /></div>}
    </div>
    <Dialog open={!!talk} onOpenChange={v => !v && setTalk(null)} title={'🤖 ' + (talk?.name || '')} wide>
      <div className="flex flex-col gap-2 max-h-80 overflow-y-auto mb-3">
        {msgs.map((m, i) => <div key={i} className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.r === 'user' ? 'self-end bg-blue-600 text-white' : 'self-start bg-zinc-100 dark:bg-white/8'}`}>{m.t}</div>)}
        {busy && <div className="text-xs text-zinc-500 animate-pulse">печатает…</div>}
      </div>
      <div className="flex gap-2"><input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()} placeholder="Написать…" className="flex-1 h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" /><Button onClick={ask}><Send size={15} /></Button></div>
    </Dialog>
    <Dialog open={show} onOpenChange={setShow} title="Новый бот">
      <div className="flex flex-col gap-2.5">
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Имя: Friday" className="h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" />
        <input value={form.persona} onChange={e => setForm({ ...form, persona: e.target.value })} placeholder="Описание: дерзкий помощник" className="h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" />
        <textarea value={form.system} onChange={e => setForm({ ...form, system: e.target.value })} placeholder="Системный промпт (характер, стиль)…" rows={3} className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm outline-none" />
        <Button onClick={create}><BotIcon size={15} /> Опубликовать</Button>
      </div>
    </Dialog>
  </div>;
}
