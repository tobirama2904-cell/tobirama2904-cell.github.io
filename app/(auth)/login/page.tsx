'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Github, Chrome } from 'lucide-react';
import { supaBrowser, isCloud } from '@/lib/supabase/client';
import { Button, Input } from '@/components/ui/primitives';

export default function Login() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const cloud = isCloud();
  const login = async () => {
    setErr(''); setBusy(true);
    const { error } = await supaBrowser().auth.signInWithPassword({ email, password: pass });
    setBusy(false);
    if (error) setErr(error.message === 'Invalid login credentials' ? 'Неверный email или пароль' : error.message);
    else router.push('/chat');
  };
  const oauth = (p: 'google' | 'github') => supaBrowser().auth.signInWithOAuth({ provider: p, options: { redirectTo: location.origin + '/chat' } });
  return <div className="min-h-screen grid place-items-center p-4 grid-bg">
    <div className="w-full max-w-sm glass rounded-3xl p-8 shadow-2xl animate-[fadeUp_.5s]">
      <div className="size-12 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 grid place-items-center text-white font-bold text-xl mx-auto shadow-lg shadow-blue-600/30">◈</div>
      <h1 className="font-display font-bold text-xl text-center mt-4">С возвращением</h1>
      <p className="text-sm text-zinc-500 text-center mt-1">Войди в LEGION</p>
      {!cloud && <div className="mt-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-semibold p-3">Облако не подключено — работаю в гостевом режиме. <Link href="/chat" className="underline">Продолжить гостем →</Link></div>}
      <div className="mt-5 flex flex-col gap-2.5">
        <Input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} />
        <Input placeholder="Пароль" type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} />
        {err && <div className="text-xs font-bold text-rose-500">{err}</div>}
        <Button onClick={login} disabled={busy || !cloud} className="w-full">{busy ? 'Вхожу…' : 'Войти'}</Button>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={!cloud} onClick={() => oauth('google')}><Chrome size={15} /> Google</Button>
          <Button variant="outline" className="flex-1" disabled={!cloud} onClick={() => oauth('github')}><Github size={15} /> GitHub</Button>
        </div>
        <div className="text-center text-sm text-zinc-500 mt-1">Нет аккаунта? <Link href="/register" className="text-blue-500 font-bold">Регистрация</Link></div>
      </div>
    </div>
  </div>;
}
