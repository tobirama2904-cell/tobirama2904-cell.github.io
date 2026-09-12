'use client';
import { useState } from 'react';
import { Zap, Download, Loader2 } from 'lucide-react';
import { Button, Empty } from '@/components/ui/primitives';
import ReactMarkdown from 'react-markdown';

interface Msn { id: string; title: string; pct: number; label: string; state: 'run' | 'done' | 'err'; result: string; }
export default function MissionsPage() {
  const [topic, setTopic] = useState('');
  const [list, setList] = useState<Msn[]>([]);
  const one = async (body: object) => (await (await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()).text as string;
  const deep = async () => {
    if (!topic.trim()) return;
    let key = ''; try { key = localStorage.getItem('legion-agnes-key') || ''; } catch {}
    const id = Math.random().toString(36).slice(2);
    const m: Msn = { id, title: '🧬 DEEP: ' + topic.slice(0, 60), pct: 0, label: '…', state: 'run', result: '' };
    setList(l => [m, ...l]);
    const set = (p: Partial<Msn>) => setList(l => l.map(x => x.id === id ? { ...x, ...p } : x));
    try {
      set({ pct: 8, label: 'черновик…' });
      const draft = await one({ apiKey: key || undefined, system: 'Ты LEGION. Глубокий развернутый черновик ответа по-русски.', prompt: topic });
      set({ pct: 40, label: 'критика…' });
      const crit = await one({ apiKey: key || undefined, system: 'Ты беспощадный критик. Слабые места черновика списком, по-русски.', prompt: draft.slice(0, 5000) });
      set({ pct: 68, label: 'финал…' });
      const fin = await one({ apiKey: key || undefined, system: 'Собери финал по-русски: учти критику. Структура, конкретика, вывод.', prompt: `Тема: ${topic}\nЧерновик:\n${draft.slice(0, 4000)}\nКритика:\n${crit.slice(0, 2000)}` });
      set({ pct: 100, label: 'готово', state: 'done', result: `## Финал\n\n${fin}\n\n## Критика\n\n${crit}\n\n## Черновик\n\n${draft}` });
    } catch (e) { set({ state: 'err', label: 'ошибка: ' + String(e).slice(0, 100) }); }
    setTopic('');
  };
  const dl = (m: Msn) => {
    const blob = new Blob([`# ${m.title}\n\n${m.result}`], { type: 'text/markdown' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'legion-deep.md'; a.click();
  };
  return <div className="max-w-3xl mx-auto">
    <h1 className="font-display font-bold text-xl mb-3 flex items-center gap-2"><Zap className="text-amber-500" /> Легион · задачи</h1>
    <div className="glass rounded-2xl p-3 flex gap-2">
      <input value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && deep()} placeholder="Тема глубокого разбора: /deep …" className="flex-1 h-11 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 outline-none focus:border-blue-500 font-medium" />
      <Button onClick={deep}>🧬 DEEP</Button>
    </div>
    <div className="flex flex-col gap-3 mt-3">
      {list.length === 0 && <Empty icon="⚡" title="Легион ждёт приказов" sub="Глубокий разбор: черновик → критика → финал + файл" />}
      {list.map(m => <div key={m.id} className="glass rounded-2xl p-4 animate-[msgIn_.35s]">
        <div className="flex items-center gap-2"><b className="text-sm flex-1">{m.title}</b>
          {m.state === 'run' ? <Loader2 size={15} className="animate-spin text-amber-500" /> : m.state === 'done' ? <span className="text-xs font-bold text-emerald-500">✓ ГОТОВО</span> : <span className="text-xs font-bold text-rose-500">✖ ОШИБКА</span>}
        </div>
        <div className="h-2 rounded-full bg-zinc-200 dark:bg-white/10 mt-2.5 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-500" style={{ width: m.pct + '%' }} /></div>
        <div className="text-xs text-zinc-500 font-semibold mt-1">{m.label}</div>
        {m.result && <><div className="prose dark:prose-invert prose-sm max-w-none mt-3 max-h-96 overflow-y-auto"><ReactMarkdown>{m.result.split('## Критика')[0].replace('## Финал', '')}</ReactMarkdown></div>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => dl(m)}><Download size={14} /> Скачать .md</Button></>}
      </div>)}
    </div>
  </div>;
}
