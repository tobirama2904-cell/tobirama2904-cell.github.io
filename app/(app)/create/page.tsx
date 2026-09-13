'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, Video, Type, Sparkles, Send } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Button, Empty, Textarea } from '@/components/ui/primitives';
import { Tabs } from '@/components/ui/overlays';
import { publishPost, publishStory } from '@/lib/hybrid/social';
import { uploadFile, compressImage, compressVideo } from '@/lib/hybrid/storage';

function agnesKey(): string {
  try { return localStorage.getItem('legion-agnes-key') || ''; } catch { return ''; }
}

export default function CreatePage() {
  const me = useStore(s => s.me);
  const logged = me && !me.guest;
  const router = useRouter();
  const [tab, setTab] = useState('photo');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [caption, setCaption] = useState('');
  const [dest, setDest] = useState<'feed' | 'story'>('feed');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [prompt, setPrompt] = useState('');
  const [err, setErr] = useState('');
  const [genImg, setGenImg] = useState('');
  const [genBusy, setGenBusy] = useState(false);

  const pick = (f: File) => {
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };
  const publish = async () => {
    if (!logged || busy) return;
    if (tab === 'text' && !caption.trim()) return;
    if (tab !== 'text' && tab !== 'art' && !file) return;
    if (tab === 'art' && !genImg) return;
    setBusy(true);
    setErr('');
    try {
      let url = genImg;
      if (file && tab !== 'art') {
        let f = file;
        if (f.type.startsWith('image/') && f.size > 1_000_000) { setStep('🗜 Сжимаю фото…'); f = await compressImage(f); }
        if (f.type.startsWith('video/') && f.size > 12_000_000) { setStep('🎬 Сжимаю видео…'); f = await compressVideo(f, t => setStep(t)); }
        setStep(`⬆ Загружаю (${(f.size / 1048576).toFixed(1)} МБ)… 0%`);
        url = await uploadFile(f, (pct, host) => setStep(`⬆ ${host} · ${pct}%`));
        if (!url) throw new Error('empty-url');
      }
      setStep('📡 Публикую…');
      const isVideo = tab === 'video' || !!file?.type.startsWith('video');
      let ok: unknown = null;
      if (dest === 'story') ok = await publishStory(caption.trim() || (isVideo ? '🎬' : '📸'), isVideo ? null : (url || null), isVideo ? (url || null) : null);
      else ok = await publishPost(caption.trim(), !isVideo ? url || null : null, isVideo ? url || null : null);
      if (!ok) throw new Error('relay-down');
      router.push(dest === 'story' ? '/feed' : isVideo ? '/clips' : '/feed');
    } catch (e) {
      const m = String(e);
      setErr(m.includes('upload-failed') ? 'Файл не загрузился: все бесплатные хосты недоступны. Уменьши файл или попробуй позже.' : m.includes('relay-down') ? 'Файл загружен, но релеи не приняли пост. Попробуй ещё раз.' : 'Не вышло — проверь сеть и попробуй снова');
    }
    setBusy(false);
    setStep('');
  };
  const generate = async () => {
    if (!prompt.trim() || genBusy) return;
    setGenBusy(true);
    try {
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: agnesKey() || undefined, mode: 'image', prompt: prompt.trim().slice(0, 800) }) });
      const j = await r.json();
      if (j.image) { setGenImg(j.image); setCaption(prompt.trim().slice(0, 200)); }
      else alert('Не вышло (нужен Agnes-ключ)');
    } catch { alert('Не вышло'); }
    setGenBusy(false);
  };

  if (!me) return <div className="max-w-2xl mx-auto"><Empty icon="…" title="Загрузка…" /></div>;
  if (!logged) return <div className="max-w-2xl mx-auto"><Empty icon="➕" title="Войди, чтобы создавать" /></div>;
  return <div className="max-w-2xl mx-auto pb-10">
    <h1 className="font-display font-bold text-xl mb-3">Создать</h1>
    <Tabs value={tab} onValue={t => { setTab(t); setFile(null); setPreview(''); }} tabs={[
      { v: 'photo', label: <span className="flex items-center gap-1.5"><ImagePlus size={15} /> Фото</span> },
      { v: 'video', label: <span className="flex items-center gap-1.5"><Video size={15} /> Видео</span> },
      { v: 'text', label: <span className="flex items-center gap-1.5"><Type size={15} /> Текст</span> },
      { v: 'art', label: <span className="flex items-center gap-1.5"><Sparkles size={15} /> AI-арт</span> },
    ]} />
    {(tab === 'photo' || tab === 'video') && <div className="mt-3">
      {!preview ? <label className="block rounded-3xl border-2 border-dashed border-zinc-300 dark:border-white/15 p-10 text-center cursor-pointer hover:border-blue-500 transition">
        <div className="text-4xl">{tab === 'photo' ? '🖼️' : '🎬'}</div>
        <div className="font-bold mt-2">Выбери {tab === 'photo' ? 'фото' : 'видео'}</div>
        <div className="text-sm text-zinc-500">до 200 МБ · полетит в бесплатное облако</div>
        <input type="file" accept={tab === 'photo' ? 'image/*' : 'video/*'} hidden onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }} />
      </label> : <div className="relative rounded-3xl overflow-hidden">
        {tab === 'photo' ? <img src={preview} alt="" className="w-full max-h-[50vh] object-contain bg-black/5" /> : <video src={preview} controls className="w-full max-h-[50vh] bg-black" />}
        <button onClick={() => { setFile(null); setPreview(''); }} className="absolute top-3 right-3 size-9 grid place-items-center rounded-full bg-black/60 text-white">✕</button>
      </div>}
    </div>}
    {tab === 'art' && <div className="mt-3 glass rounded-2xl p-4">
      <div className="flex gap-2">
        <input value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && generate()} placeholder="Опиши картинку: неоновый дракон над городом…" className="flex-1 h-11 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 outline-none focus:border-blue-500 font-medium" />
        <Button onClick={generate} disabled={genBusy || !prompt.trim()}>{genBusy ? 'Рисую…' : '🎨'}</Button>
      </div>
      {genImg && <img src={genImg} alt="" className="mt-3 rounded-2xl w-full max-h-[50vh] object-contain bg-black/5" />}
      {!genImg && !agnesKey() && <a href="https://platform.agnes-ai.com/settings/apiKeys" target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-center gap-2 h-10 rounded-xl bg-gradient-to-r from-violet-600 to-blue-500 text-white text-sm font-bold">🔑 Получить бесплатный Agnes-ключ</a>}
      {!genImg && !!agnesKey() && <div className="text-xs text-zinc-500 mt-2">Ключ вставлен — можно генерировать.</div>}
    </div>}
    <div className="glass rounded-2xl p-4 mt-3">
      <Textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="Подпись…" rows={2} maxLength={2000} />
      <div className="flex gap-2 mt-2.5 flex-wrap items-center">
        <div className="flex rounded-xl border border-zinc-200 dark:border-white/10 overflow-hidden text-sm font-bold">
          <button onClick={() => setDest('feed')} className={`px-4 py-2 ${dest === 'feed' ? 'bg-blue-600 text-white' : 'text-zinc-500'}`}>📰 Лента</button>
          <button onClick={() => setDest('story')} className={`px-4 py-2 ${dest === 'story' ? 'bg-blue-600 text-white' : 'text-zinc-500'}`}>📸 История</button>
        </div>
        <Button onClick={publish} disabled={busy} className="ml-auto"><Send size={15} /> {busy ? step || '…' : 'Опубликовать'}</Button>
      {err && <div className="w-full text-[13px] font-semibold text-rose-500 bg-rose-500/10 rounded-xl px-3 py-2">{err}</div>}
      </div>
    </div>
  </div>;
}
