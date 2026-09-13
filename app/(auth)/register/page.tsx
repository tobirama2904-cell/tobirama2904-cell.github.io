'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Check, Download } from 'lucide-react';
import { supaBrowser } from '@/lib/supabase/client';
import { exportNsec, loadSession } from '@/lib/hybrid/identity';
import { Button, Input } from '@/components/ui/primitives';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [key, setKey] = useState('');
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  useEffect(() => { try { if (loadSession() && !done) router.replace('/chat'); } catch {} }, [router]);

  const reg = async () => {
    if (!name.trim() || !email.includes('@') || pass.length < 6) { setErr('Имя, корректный email и пароль от 6 символов'); return; }
    setErr(''); setBusy(true);
    const { error } = await supaBrowser().auth.signUp({ email, password: pass, options: { data: { name: name.trim() } } });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    try {
      const k = exportNsec() || '';
      setKey(k);
      try { localStorage.setItem('legion-agnes-key', localStorage.getItem('legion-agnes-key') || ''); } catch {}
    } catch {}
    setDone(true);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(key); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  const dl = () => {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([`LEGION backup — ${email}\nИмя: ${name}\nКлюч: ${key}\n\nХрани в надёжном месте. Это доступ к аккаунту.`], { type: 'text/plain' }));
      a.download = 'legion-backup.txt';
      a.click();
    } catch {}
  };
  return <div className="min-h-screen grid place-items-center p-4 grid-bg">
    <div className="w-full max-w-sm glass rounded-3xl p-8 shadow-2xl animate-[fadeUp_.5s]">
      <div className="size-12 rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 grid place-items-center text-white font-bold text-xl mx-auto shadow-lg shadow-orange-500/30">◈</div>
      {!done ? <>
        <h1 className="font-display font-bold text-xl text-center mt-4">Создать аккаунт</h1>
        <p className="text-sm text-zinc-500 text-center mt-1">Бесплатно. Навсегда. Без серверов.</p>
        <div className="mt-5 flex flex-col gap-2.5">
          <Input placeholder="Имя / ник" value={name} onChange={e => setName(e.target.value)} />
          <Input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <Input placeholder="Пароль (мин. 6)" type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && reg()} />
          {err && <div className="text-xs font-bold text-rose-500">{err}</div>}
          <Button onClick={reg} disabled={busy} className="w-full">{busy ? 'Создаю…' : 'Зарегистрироваться'}</Button>
          <div className="text-center text-sm text-zinc-500 mt-1">Уже есть? <Link href="/login" className="text-blue-500 font-bold">Войти</Link></div>
        </div>
      </> : <>
        <h1 className="font-display font-bold text-xl text-center mt-4">Готово! 🎉</h1>
        <p className="text-sm text-zinc-500 text-center mt-1">Сохрани секретный ключ — это доступ к аккаунту с любого устройства</p>
        <div className="mt-4 rounded-xl bg-zinc-950 text-emerald-400 font-mono text-xs p-3 break-all select-all">{key || '…'}</div>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={copy}>{copied ? <><Check size={15} /> Скопировано</> : <><Copy size={15} /> Копировать</>}</Button>
          <Button variant="outline" className="flex-1" onClick={dl}><Download size={15} /> Файл</Button>
        </div>
        <Button onClick={() => router.push('/chat')} className="w-full mt-3">Сохранил — войти →</Button>
      </>}
    </div>
  </div>;
}
