'use client';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState } from 'react';
import { Send, KeyRound } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button, Empty } from '@/components/ui/primitives';
import { supaBrowser, isCloud } from '@/lib/supabase/client';
import { useStore } from '@/lib/store';
import type { Bot as BotT } from '@/lib/supabase/types';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { DictateButton } from '@/components/dictate';

function apiKey(): string {
  try { return localStorage.getItem('legion-agnes-key') || ''; } catch { return ''; }
}
function Thread({ bot, apiKey, meName, uid }: { bot: BotT | null; apiKey: string; meName: string; uid: string }) {
  const [parent] = useAutoAnimate();
  const bottom = useRef<HTMLDivElement>(null);
  const storeKey = `legion-ai-hist-${uid || 'guest'}-${bot?.id || 'legion'}`;
  const [initial] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(storeKey) || '[]');
      return Array.isArray(raw) ? raw.filter(m => m && m.role && m.parts) : [];
    } catch { return []; }
  });
  const { messages, sendMessage, status, error } = useChat({
    messages: initial as never,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { system: bot?.system || undefined, apiKey: apiKey || undefined },
    }),
    onError: () => {},
  });
  useEffect(() => {
    try { localStorage.setItem(storeKey, JSON.stringify(messages.slice(-100))); } catch {}
  }, [messages, storeKey]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, status]);
  const [input, setInput] = useState('');
  const send = () => { if (!input.trim() || status === 'streaming') return; sendMessage({ text: input.trim() }); setInput(''); };
  const busy = status === 'streaming' || status === 'submitted';
  return <>
    <div ref={parent} className="min-h-0 flex-1 overflow-y-auto rounded-2xl glass p-4 flex flex-col gap-3 chat-scroll">
      {messages.length === 0 && <Empty icon="◈" title={bot ? `Это ${bot.name}` : 'Привет! Я LEGION'} sub={bot?.persona || 'Спроси что угодно. Умею погоду, курсы, новости, время — и просто болтать.'} />}
      {messages.map(m => <div key={m.id} className={`max-w-[88%] animate-[msgIn_.35s_cubic-bezier(.34,1.56,.64,1)] ${m.role === 'user' ? 'self-end' : 'self-start'}`}>
        <div className="text-[10px] font-bold tracking-widest text-zinc-400 mb-1">{m.role === 'user' ? meName : (bot?.name || 'LEGION')}</div>
        <div className={`rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed prose dark:prose-invert prose-sm max-w-none ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-zinc-100 dark:bg-white/8 rounded-bl-md'}`}>
          <ReactMarkdown>{m.parts.map(p => p.type === 'text' ? p.text : '').join('')}</ReactMarkdown>
        </div>
      </div>)}
      {busy && <div className="text-sm text-zinc-500 font-semibold animate-pulse">◌ Легион думает…</div>}
      {error && <div className="text-sm font-bold text-rose-500">⚠ {String((error as Error).message || error).slice(0, 200)}</div>}
      <div ref={bottom} />
    </div>
    <div className="mt-3 flex gap-2">
      <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder={apiKey ? 'Спроси…' : 'Спроси… (вставь ключ кнопкой выше для ответов)'} className="flex-1 h-12 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 transition font-medium" />
      <DictateButton className="!size-12 !rounded-2xl" onText={t => setInput(v => (v ? v + ' ' : '') + t)} />
      <Button size="icon" className="!size-12 !rounded-2xl" onClick={send} disabled={busy}><Send size={18} /></Button>
    </div>
  </>;
}
export default function ChatPage() {
  const me = useStore(s => s.me);
  const [bots, setBots] = useState<BotT[]>([]);
  const [bot, setBot] = useState<BotT | null>(null);
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  useEffect(() => { setKey(apiKey()); }, []);
  useEffect(() => {
    if (!isCloud() || !me || me.guest) return;
    supaBrowser().from('bots').select('*,owner:profiles!bots_owner_id_fkey(*)').eq('is_public', true).order('uses', { ascending: false }).limit(12).then(({ data }) => setBots((data || []) as never[]));
  }, [me]);
  return <div className="flex flex-col h-[calc(100vh-7rem)] lg:h-[calc(100vh-3rem)]">
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <h1 className="font-display font-bold text-lg">AI Чат</h1>
      {bots.length > 0 && <select value={bot?.id || ''} onChange={e => setBot(bots.find(b => b.id === e.target.value) || null)} className="text-xs font-bold rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1.5 outline-none">
        <option value="">◈ LEGION</option>
        {bots.map(b => <option key={b.id} value={b.id}>🤖 {b.name}</option>)}
      </select>}
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => { try { Object.keys(localStorage).filter(k => k.startsWith('legion-ai-hist-')).forEach(k => localStorage.removeItem(k)); } catch {} location.reload(); }}>🧹 Очистить</Button>
        <Button size="sm" variant="outline" onClick={() => setShowKey(!showKey)}><KeyRound size={14} /> Ключ</Button>
      </div>
    </div>
    {showKey && <div className="mb-3 rounded-xl glass p-3 flex gap-2">
      <input value={key} onChange={e => { setKey(e.target.value); try { localStorage.setItem('legion-agnes-key', e.target.value); } catch {} }} placeholder="Agnes API key (sk-...)" type="password" className="flex-1 bg-transparent outline-none text-sm font-mono" />
    </div>}
    {!key && <a href="https://platform.agnes-ai.com/settings/apiKeys" target="_blank" rel="noreferrer" className="mb-3 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 via-blue-600 to-cyan-500 text-white p-3.5 text-sm font-bold shadow-lg shadow-blue-600/25 hover:scale-[1.01] active:scale-99 transition">
      🔑 Нет ключа? Получи бесплатный Agnes-ключ за минуту — и Легион заговорит
    </a>}
    <Thread key={(bot?.id || 'legion') + '|' + key + '|' + (me?.id || 'guest')} bot={bot} apiKey={key} meName={me?.name || 'ВЫ'} uid={me?.id || 'guest'} />
  </div>;
}
