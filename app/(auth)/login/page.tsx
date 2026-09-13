'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KeyRound, Send } from 'lucide-react';
import { supaBrowser } from '@/lib/supabase/client';
import { importKey, attachTelegram } from '@/lib/hybrid/identity';
import { tgBot } from '@/lib/hybrid/config';
import { Button, Input } from '@/components/ui/primitives';

export default function Login() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [nsec, setNsec] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const tgRef = useRef<HTMLDivElement>(null);
  const [tgName, setTgName] = useState('');
  const [tgManual, setTgManual] = useState(false);

  useEffect(() => {
    const bot = tgBot();
    if (bot) setTgName(bot);
  }, []);
  useEffect(() => {
    const bot = tgName;
    if (!bot || !tgRef.current || tgRef.current.children.length) return;
    (window as any).onTelegramAuth = (u: { id: number; username?: string; first_name?: string; photo_url?: string }) => {
      try {
        attachTelegram({ id: u.id, username: u.username, first_name: u.first_name, photo_url: u.photo_url });
        router.push('/chat');
      } catch (e) { setErr('Telegram-вход не удался'); }
    };
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.async = true;
    s.setAttribute('data-telegram-login', bot);
    s.setAttribute('data-size', 'large');
    s.setAttribute('data-onauth', 'onTelegramAuth(user)');
    tgRef.current.appendChild(s);
  }, [router, tgName]);

  const login = async () => {
    setErr(''); setBusy(true);
    const { error } = await supaBrowser().auth.signInWithPassword({ email, password: pass });
    setBusy(false);
    if (error) setErr(error.message);
    else router.push('/chat');
  };
  const loginKey = async () => {
    if (!nsec.trim()) return;
    setErr(''); setBusy(true);
    try { importKey(nsec.trim()); router.push('/chat'); }
    catch { setErr('Неверный ключ (нужен nsec1… или 64 hex-символа)'); }
    setBusy(false);
  };
  return <div className="min-h-screen grid place-items-center p-4 grid-bg">
    <div className="w-full max-w-sm glass rounded-3xl p-8 shadow-2xl animate-[fadeUp_.5s]">
      <div className="size-12 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 grid place-items-center text-white font-bold text-xl mx-auto shadow-lg shadow-blue-600/30">◈</div>
      <h1 className="font-display font-bold text-xl text-center mt-4">С возвращением</h1>
      <p className="text-sm text-zinc-500 text-center mt-1">Войди в LEGION — бесплатно навсегда</p>
      <div className="mt-5 flex flex-col gap-2.5">
        <Input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} />
        <Input placeholder="Пароль" type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} />
        {err && <div className="text-xs font-bold text-rose-500">{err}</div>}
        <Button onClick={login} disabled={busy} className="w-full">{busy ? 'Вхожу…' : 'Войти'}</Button>
        {tgName ? <><div className="flex items-center gap-2 text-[11px] font-bold text-zinc-400"><span className="flex-1 h-px bg-zinc-200 dark:bg-white/10" />ИЛИ<span className="flex-1 h-px bg-zinc-200 dark:bg-white/10" /></div>
        <div ref={tgRef} className="flex justify-center" /></> : <>
          {!tgManual ? <button onClick={() => setTgManual(true)} className="text-xs font-bold text-sky-500 hover:underline">✈️ Войти через Telegram</button>
          : <div className="flex gap-2">
            <Input placeholder="имя бота (без @)" value={tgName} onChange={e => setTgName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && tgName.trim()) { try { localStorage.setItem('legion-tg-bot', tgName.trim()); } catch {} } }} />
            <Button onClick={() => { if (tgName.trim()) { try { localStorage.setItem('legion-tg-bot', tgName.trim()); } catch {} } }}><Send size={15} /></Button>
          </div>}
        </>}
        <Button variant="outline" className="w-full" onClick={() => setShowKey(!showKey)}><KeyRound size={15} /> Войти по ключу nsec</Button>
        {showKey && <div className="flex gap-2">
          <Input placeholder="nsec1…" value={nsec} onChange={e => setNsec(e.target.value)} onKeyDown={e => e.key === 'Enter' && loginKey()} />
          <Button onClick={loginKey} disabled={busy}><Send size={15} /></Button>
        </div>}
        <div className="text-center text-sm text-zinc-500 mt-1">Нет аккаунта? <Link href="/register" className="text-blue-500 font-bold">Регистрация</Link> · <Link href="/chat" className="text-zinc-400">Гость →</Link></div>
      </div>
    </div>
  </div>;
}
