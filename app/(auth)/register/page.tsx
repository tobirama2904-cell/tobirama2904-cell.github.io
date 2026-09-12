'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supaBrowser, isCloud } from '@/lib/supabase/client';
import { Button, Input } from '@/components/ui/primitives';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const cloud = isCloud();
  const reg = async () => {
    if (!name.trim() || !email.includes('@') || pass.length < 6) { setErr('Имя, корректный email и пароль от 6 символов'); return; }
    setErr(''); setBusy(true);
    const { error } = await supaBrowser().auth.signUp({ email, password: pass, options: { data: { name: name.trim() } } });
    setBusy(false);
    if (error) setErr(error.message);
    else router.push('/chat');
  };
  return <div className="min-h-screen grid place-items-center p-4 grid-bg">
    <div className="w-full max-w-sm glass rounded-3xl p-8 shadow-2xl animate-[fadeUp_.5s]">
      <div className="size-12 rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 grid place-items-center text-white font-bold text-xl mx-auto shadow-lg shadow-orange-500/30">◈</div>
      <h1 className="font-display font-bold text-xl text-center mt-4">Создать аккаунт</h1>
      <p className="text-sm text-zinc-500 text-center mt-1">Бесплатно. Навсегда.</p>
      {!cloud && <div className="mt-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-semibold p-3">Облако не подключено — регистрация появится после настройки Supabase (см. SETUP.md). <Link href="/chat" className="underline">Продолжить гостем →</Link></div>}
      <div className="mt-5 flex flex-col gap-2.5">
        <Input placeholder="Имя / ник" value={name} onChange={e => setName(e.target.value)} />
        <Input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <Input placeholder="Пароль (мин. 6)" type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && reg()} />
        {err && <div className="text-xs font-bold text-rose-500">{err}</div>}
        <Button onClick={reg} disabled={busy || !cloud} className="w-full">{busy ? 'Создаю…' : 'Зарегистрироваться'}</Button>
        <div className="text-center text-sm text-zinc-500 mt-1">Уже есть? <Link href="/login" className="text-blue-500 font-bold">Войти</Link></div>
      </div>
    </div>
  </div>;
}
