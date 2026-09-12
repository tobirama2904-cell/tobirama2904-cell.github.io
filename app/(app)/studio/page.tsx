'use client';
import { useState } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { Button, Empty } from '@/components/ui/primitives';

function kindOf(f: File) {
  const t = f.type.toLowerCase(), n = f.name.toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  if (t === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  return 'text';
}
async function visionAgnes(images: string[], prompt: string, key: string) {
  const base = process.env.NEXT_PUBLIC_AGNES_BASE || 'https://apihub.agnes-ai.com/v1';
  const r = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: 'agnes-2.5-flash', max_tokens: 800, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...images.map(u => ({ type: 'image_url', image_url: { url: u } }))] }] }) });
  const j = await r.json();
  return j.choices?.[0]?.message?.content || 'Пустой ответ';
}
const readAs = (f: Blob, mode: 'url' | 'text') => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; mode === 'url' ? r.readAsDataURL(f) : r.readAsText(f); });
function thumb(dataUrl: string, maxW = 640): Promise<string> {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => { const k = Math.min(1, maxW / im.width); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.8)); };
    im.onerror = () => res(dataUrl); im.src = dataUrl;
  });
}
export default function StudioPage() {
  const [files, setFiles] = useState<{ f: File; url: string; kind: string; status: string; result: string }[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  let key = ''; try { key = localStorage.getItem('legion-agnes-key') || ''; } catch {}
  const stage = (list: FileList | File[]) => {
    [...list].slice(0, 8).forEach(f => setFiles(p => [...p, { f, url: URL.createObjectURL(f), kind: kindOf(f), status: 'wait', result: '' }]));
  };
  const analyzeOne = async (i: number) => {
    const it = files[i];
    setFiles(p => p.map((x, j) => j === i ? { ...x, status: 'busy' } : x));
    try {
      let text = '';
      if (it.kind === 'image') {
        if (!key) throw new Error('NO_KEY');
        const small = await thumb(await readAs(it.f, 'url'));
        const d = await visionAgnes([small], q || 'Разбери изображение по-русски: что на нём, текст, детали. Компактно.', key);
        text = '🖼 **Разбор изображения**\n\n' + d;
      } else if (it.kind === 'video') {
        if (!key) throw new Error('NO_KEY');
        const url = URL.createObjectURL(it.f);
        const v = document.createElement('video'); v.muted = true; v.src = url;
        await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = rej; });
        const N = 6, frames: string[] = [], c = document.createElement('canvas');
        for (let k = 0; k < N; k++) {
          await new Promise(res => { const to = setTimeout(res, 2500); v.onseeked = () => { clearTimeout(to); res(null); }; try { v.currentTime = (v.duration * (k + 0.5)) / N; } catch { res(null); } });
          c.width = 480; c.height = 270; c.getContext('2d')!.drawImage(v, 0, 0, 480, 270);
          frames.push(c.toDataURL('image/jpeg', 0.7));
        }
        URL.revokeObjectURL(url);
        const d = await visionAgnes(frames, q || `Это ${N} кадров видео (${v.duration.toFixed(1)} сек) по порядку. Опиши что происходит, по-русски.`, key);
        text = `🎬 **Разбор видео**\n\n${d}`;
      } else if (it.kind === 'text') {
        const content = (await readAs(it.f, 'text')).slice(0, 12000);
        if (!key) text = `📝 **${it.f.name}**\n\n${content.slice(0, 1500)}`;
        else {
          const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key, system: q ? 'Ответь на вопрос по файлу, по-русски.' : 'Разбери файл: что это, главное, заметки. По-русски, компактно.', prompt: `Файл ${it.f.name}:\n${content.slice(0, 8000)}${q ? '\nВопрос: ' + q : ''}` }) });
          text = `📝 **${it.f.name}**\n\n` + (await r.json()).text;
        }
      } else if (it.kind === 'audio') {
        text = `🎵 **${it.f.name}** (${(it.f.size / 1024).toFixed(0)} КБ)\nАудио принято. Распознавание речи — через голосовые в мессенджере.`;
      } else {
        text = `📄 **${it.f.name}** (${(it.f.size / 1024).toFixed(0)} КБ)\nПрямое чтение PDF в разработке. Обход: открой PDF, скопируй текст в .txt и залей сюда — разберу.`;
      }
      setFiles(p => p.map((x, j) => j === i ? { ...x, status: 'done', result: text } : x));
    } catch (e: unknown) {
      setFiles(p => p.map((x, j) => j === i ? { ...x, status: 'wait', result: (e as Error)?.message === 'NO_KEY' ? '⚠ Нужен Agnes-ключ (вкладка AI Чат → Ключ).' : '⚠ ' + String(e).slice(0, 150) } : x));
    }
  };
  const go = async () => { setBusy(true); for (let i = 0; i < files.length; i++) if (files[i].status !== 'done') await analyzeOne(i); setBusy(false); };
  return <div className="max-w-3xl mx-auto">
    <h1 className="font-display font-bold text-xl mb-3">Студия · фото и видео</h1>
    <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); stage(e.dataTransfer.files); }}
      className={`rounded-3xl border-2 border-dashed p-10 text-center transition ${drag ? 'border-blue-500 bg-blue-500/5 scale-[1.01]' : 'border-zinc-300 dark:border-white/15'}`}>
      <Upload size={36} className="mx-auto text-blue-500" />
      <div className="font-bold mt-2">Перетащи файлы сюда</div>
      <div className="text-sm text-zinc-500">фото · видео · тексты · аудио</div>
      <label className="inline-block mt-3 cursor-pointer"><span className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white text-sm font-bold px-5 py-2.5">Выбрать файлы</span>
        <input type="file" multiple hidden onChange={e => { if (e.target.files) stage(e.target.files); e.target.value = ''; }} /></label>
    </div>
    <div className="flex gap-2 mt-3">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Вопрос к файлам (необязательно)…" className="flex-1 h-11 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 outline-none focus:border-blue-500 font-medium" />
      <Button onClick={go} disabled={busy || files.length === 0}>{busy && <Loader2 size={15} className="animate-spin" />} Анализировать</Button>
    </div>
    <div className="grid sm:grid-cols-2 gap-3 mt-4">
      {files.length === 0 && <div className="sm:col-span-2"><Empty icon="🎬" title="Пока пусто" sub="Добавь файлы выше" /></div>}
      {files.map((it, i) => <div key={i} className="glass rounded-2xl overflow-hidden animate-[msgIn_.35s]">
        {it.kind === 'image' ? <img src={it.url} alt="" className="h-40 w-full object-cover" /> : it.kind === 'video' ? <video src={it.url} className="h-40 w-full object-cover" muted /> : <div className="h-24 grid place-items-center text-4xl bg-blue-500/5"><FileText className="text-blue-500" /></div>}
        <div className="p-3">
          <div className="text-sm font-bold truncate">{it.f.name}</div>
          <div className="text-xs font-bold text-zinc-500">{it.status === 'busy' ? '◌ анализ…' : it.status === 'done' ? '✓ готов' : 'ждёт'}</div>
          {it.result && <div className="text-[13px] mt-2 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">{it.result}</div>}
        </div>
      </div>)}
    </div>
  </div>;
}
