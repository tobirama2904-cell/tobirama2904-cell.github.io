'use client';
import { useEffect, useState } from 'react';
import { Bot as BotIcon, Plus, Send, Trash2, Eye, EyeOff } from 'lucide-react';
import { supaBrowser, isCloud } from '@/lib/supabase/client';
import { useStore } from '@/lib/store';
import { Avatar, Button, Empty } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/overlays';
import { listBots, createBot, setBotPublic, deleteBotAny, bumpBotUses } from '@/lib/hybrid/social';
import type { Bot } from '@/lib/supabase/types';

export default function BotsPage() {
  const me = useStore(s => s.me);
  const logged = me && !me.guest;
  const cloud = isCloud() && logged;
  const admin = me?.role === 'admin';
  const [bots, setBots] = useState<Bot[]>([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: '', persona: '', system: '' });
  const [talk, setTalk] = useState<Bot | null>(null);
  const [msgs, setMsgs] = useState<{ r: string; t: string }[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const all: Bot[] = [];
    if (cloud && me) {
      try {
        const { data } = await supaBrowser().from('bots').select('*,owner:profiles!bots_owner_id_fkey(*)').order('uses', { ascending: false }).limit(60);
        ((data || []) as Bot[]).forEach(b => {
          if (b.is_public || b.owner_id === me.id || admin) all.push(b);
        });
      } catch {}
    }
    try {
      const nb = await listBots(admin);
      nb.forEach(b => {
        if (all.some(x => x.id === b.id)) return;
        if (!b.is_public && b.owner_id !== me?.id && !admin) return;
        all.push({ id: b.id, owner_id: b.owner_id, name: b.name, avatar_url: b.avatar_url, persona: b.persona, system: b.system, is_public: b.is_public, uses: b.uses, created_at: b.created_at });
      });
    } catch {}
    setBots(all);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [cloud, logged]);
  const create = async () => {
    if (!form.name.trim() || !me) return;
    const sys = form.system.trim() || `Ты ${form.name}. Отвечай в этом образе, по-русски.`;
    if (cloud) {
      await supaBrowser().from('bots').insert({ owner_id: me.id, name: form.name.trim(), persona: form.persona, system: sys, is_public: false });
    } else {
      await createBot({ name: form.name.trim(), persona: form.persona, system: sys }, false);
    }
    setForm({ name: '', persona: '', system: '' }); setShow(false); load();
  };
  const remove = async (b: Bot) => {
    if (!confirm(`Удалить бота «${b.name}»?`)) return;
    if (cloud) { try { await supaBrowser().from('bots').delete().eq('id', b.id); } catch {} }
    await deleteBotAny(b.id).catch(() => {});
    load();
  };
  const togglePub = async (b: Bot) => {
    if (cloud) { try { await supaBrowser().from('bots').update({ is_public: !b.is_public }).eq('id', b.id); } catch {} }
    await setBotPublic(b.id, !b.is_public).catch(() => {});
    load();
  };
  const ask = async () => {
    if (!input.trim() || !talk || busy) return;
    const q = input.trim(); setInput(''); setMsgs(m => [...m, { r: 'user', t: q }]); setBusy(true);
    try {
      let key = ''; try { key = localStorage.getItem('legion-agnes-key') || ''; } catch {}
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key || undefined, system: talk.system, prompt: q }) });
      const j = await r.json();
      setMsgs(m => [...m, { r: 'bot', t: j.text || '…' }]);
      if (cloud) await supaBrowser().from('bots').update({ uses: (talk.uses || 0) + 1 }).eq('id', talk.id).then(() => {}).catch(() => {});
      bumpBotUses(talk.id);
    } catch { setMsgs(m => [...m, { r: 'bot', t: '⚠ Ошибка (нужен Agnes-ключ)' }]); }
    setBusy(false);
  };
  if (!logged) return <div className="max-w-3xl mx-auto"><h1 className="font-display font-bold text-xl mb-3">AI-Боты</h1><Empty icon="🤖" title="Войди, чтобы общаться с ботами" /></div>;
  return <div className="max-w-3xl mx-auto">
    <div className="flex items-center gap-2 mb-3">
      <h1 className="font-display font-bold text-xl">AI-Боты</h1>
      <Button size="sm" className="ml-auto" onClick={() => setShow(true)}><Plus size={14} /> Создать бота</Button>
    </div>
    <div className="grid sm:grid-cols-2 gap-3">
      {bots.map(b => <div key={b.id} className="glass rounded-2xl p-4 card-hover">
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => { setTalk(b); setMsgs([]); }}><Avatar src={b.avatar_url} name={b.name} size={44} />
          <div className="min-w-0 flex-1"><b className="text-sm flex items-center gap-1.5">{b.name} {!b.is_public && <span className="text-[10px] bg-zinc-500/15 text-zinc-500 px-1.5 py-0.5 rounded font-bold">только ты</span>}</b><div className="text-[11px] text-zinc-500">от {b.owner?.name || (b.owner_id === me.id ? 'тебя' : b.owner_id.slice(0, 8))} · {b.uses} диалогов</div></div></div>
        <p className="text-[13px] text-zinc-500 mt-2 clamp-2">{b.persona || 'Без описания'}</p>
        <div className="flex gap-2 mt-2.5">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => { setTalk(b); setMsgs([]); }}>💬 Поговорить</Button>
          {(b.owner_id === me.id || admin) && <Button size="sm" variant="outline" className="!text-rose-500" onClick={() => remove(b)}><Trash2 size={13} /></Button>}
          {admin && <Button size="sm" variant="outline" title={b.is_public ? 'Скрыть у всех' : 'Показать всем'} onClick={() => togglePub(b)}>{b.is_public ? <EyeOff size={13} /> : <Eye size={13} />}</Button>}
        </div>
      </div>)}
      {bots.length === 0 && <div className="sm:col-span-2"><Empty icon="🤖" title="Ботов пока нет" sub="Создай первого — он будет только твоим, пока админ не опубликует" /></div>}
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
        <div className="text-xs text-zinc-500">🔒 Бот будет виден только тебе. Админ может опубликовать его для всех.</div>
        <Button onClick={create}><BotIcon size={15} /> Создать</Button>
      </div>
    </Dialog>
  </div>;
}
