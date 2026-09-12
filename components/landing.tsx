'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MessageSquare, Users, Mic, Brain, Zap, ShieldCheck, ArrowRight, Check, Sparkles, Clapperboard } from 'lucide-react';
import Lottie from 'lottie-react';
import { Magnetic, Marquee, Shine, Tilt } from './glint';
import waveAnim from '@/public/lottie/wave.json';

const Orb = dynamic(() => import('./orb').then(m => m.Orb), { ssr: false, loading: () => <div className="w-full h-full animate-pulse rounded-full bg-blue-600/10" /> });

const FEATS = [
  { icon: MessageSquare, t: 'AI-чат Легион', d: 'Стриминг-ответы, инструменты, голосовой режим. Помнит тебя.' },
  { icon: Users, t: 'Соцсеть', d: 'Лента, stories, друзья, профили, уведомления в реальном времени.' },
  { icon: MessageSquare, t: 'Мессенджер', d: 'Лички, группы, голосовые, файлы, звонки, реакции.' },
  { icon: Mic, t: 'Голосовое управление', d: '«Легион, открой ленту». Wake word, команды, диктовка.' },
  { icon: Clapperboard, t: 'Студия файлов', d: 'Разбор фото, видео, PDF и аудио через нейросеть.' },
  { icon: Brain, t: 'Память', d: 'Факты, вкусы, проекты. Локально + облачная синхронизация.' },
  { icon: Zap, t: 'Легион задач', d: 'Фоновые задачи с прогрессом и глубокие разборы /deep.' },
  { icon: ShieldCheck, t: 'Админка', d: 'Мониторинг, модерация, статистика и объявления.' },
];
export function Landing() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  const yOrb = useTransform(scrollYProgress, [0, 0.4], [0, 120]);
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('.gs-reveal').forEach(el => {
        gsap.fromTo(el, { y: 44, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } });
      });
    });
    return () => ctx.revert();
  }, []);
  return <div className="noise">
    <header className="fixed top-0 inset-x-0 z-50 glass border-x-0 border-t-0">
      <div className="max-w-6xl mx-auto flex items-center gap-3 px-5 h-16">
        <div className="size-9 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-400 grid place-items-center text-white font-bold shadow-lg shadow-blue-600/30">◈</div>
        <b className="font-display tracking-widest text-sm">LEGION</b>
        <nav className="hidden md:flex gap-6 ml-8 text-sm font-semibold text-zinc-500">
          <a href="#features" className="hover:text-zinc-900 dark:hover:text-white transition">Возможности</a>
          <a href="#social" className="hover:text-zinc-900 dark:hover:text-white transition">Сеть</a>
          <a href="#free" className="hover:text-zinc-900 dark:hover:text-white transition">Free</a>
        </nav>
        <div className="ml-auto flex gap-2">
          <Link href="/login" className="px-4 py-2 text-sm font-bold rounded-xl hover:bg-zinc-100 dark:hover:bg-white/10 transition">Войти</Link>
          <Link href="/register" className="px-4 py-2 text-sm font-bold rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/25 hover:bg-blue-500 transition">Начать бесплатно</Link>
        </div>
      </div>
    </header>

    <section ref={heroRef} className="relative min-h-screen grid-bg flex items-center pt-24 pb-16 overflow-hidden">
      <div className="absolute -top-32 -left-32 size-[480px] rounded-full bg-blue-600/20 blur-[130px]" />
      <div className="absolute top-40 -right-32 size-[420px] rounded-full bg-orange-500/15 blur-[130px]" />
      <div className="max-w-6xl mx-auto px-5 grid lg:grid-cols-2 gap-10 items-center relative z-10">
        <div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-bold mb-6">
            <Sparkles size={14} className="text-blue-500" /> LEGION v19 · AI-соцсеть · Free навсегда
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="font-display text-5xl md:text-7xl font-bold leading-[1.02]">
            Твой ИИ.<br /><span className="text-gradient">Твои люди.</span><br />Одна сеть.
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="mt-6 text-lg text-zinc-500 max-w-md">
            Мессенджер, соцсеть и личный ИИ-агент с голосовым управлением. Как Jarvis — только настоящий и общий.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }} className="mt-8 flex flex-wrap gap-3">
            <Magnetic><Shine className="rounded-2xl"><Link href="/register" className="group inline-flex items-center gap-2 rounded-2xl bg-blue-600 text-white font-bold px-7 py-3.5 shadow-xl shadow-blue-600/30 hover:bg-blue-500 hover:-translate-y-0.5 transition-all">Создать аккаунт <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></Link></Shine></Magnetic>
            <Link href="/chat" className="inline-flex items-center gap-2 rounded-2xl px-7 py-3.5 font-bold border border-zinc-200 dark:border-white/15 hover:border-blue-500 transition-all hover:-translate-y-0.5">Попробовать гостем</Link>
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-8 flex gap-6 text-sm text-zinc-500 font-semibold">
            {[['⚡', 'Realtime'], ['🎙', 'Голос'], ['♾️', 'Free']].map(([i, t]) => <span key={t} className="flex items-center gap-1.5"><span>{i}</span>{t}</span>)}
          </motion.div>
        </div>
        <motion.div style={{ y: yOrb }} className="relative h-[420px] md:h-[520px]">
          <Orb className="absolute inset-0" />
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-64 opacity-70"><Lottie animationData={waveAnim} loop /></div>
        </motion.div>
      </div>
    </section>

    <div className="border-y border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[.02]"><div className="max-w-6xl mx-auto px-5"><Marquee items={["◈ AI-ЧАТ", "◈ МЕССЕНДЖЕР", "◈ ГОЛОС", "◈ ЛЕНТА", "◈ СТУДИЯ", "◈ ПАМЯТЬ", "◈ ЗВОНКИ", "◈ БОТЫ", "◈ АДМИНКА"]} /></div></div>
    <section id="features" className="max-w-6xl mx-auto px-5 py-24">
      <h2 className="gs-reveal font-display text-3xl md:text-5xl font-bold text-center">Всё. <span className="text-gradient">В одном месте.</span></h2>
      <p className="gs-reveal text-center text-zinc-500 mt-4 max-w-xl mx-auto">8 модулей, 45 фич. Ниже — главное.</p>
      <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {FEATS.map((f, i) => <motion.div key={f.t} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i % 4) * 0.07 }} className="gs-reveal glass rounded-2xl p-5 card-hover">
          <div className="size-11 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 grid place-items-center text-white mb-4 shadow-lg shadow-blue-600/25"><f.icon size={20} /></div>
          <b>{f.t}</b><p className="text-sm text-zinc-500 mt-1.5 leading-relaxed">{f.d}</p>
        </motion.div>)}
      </div>
    </section>

    <section id="social" className="border-y border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[.02]">
      <div className="max-w-6xl mx-auto px-5 py-24 grid lg:grid-cols-2 gap-12 items-center">
        <div className="gs-reveal">
          <h2 className="font-display text-3xl md:text-5xl font-bold">Соцсеть, где <span className="text-gradient">ИИ — свой</span></h2>
          <ul className="mt-8 flex flex-col gap-4">
            {['Лента постов, stories, лайки и репосты', 'Мессенджер: лички, группы, звонки, голосовые', 'Легион прямо в чатах: саммари, перевод, идеи', 'Профили, друзья, галочки, приватность'].map(t => <li key={t} className="flex items-center gap-3 font-semibold"><span className="size-7 rounded-full bg-emerald-500/15 text-emerald-500 grid place-items-center shrink-0"><Check size={15} /></span>{t}</li>)}
          </ul>
        </div>
        <Tilt className="gs-reveal glass rounded-3xl p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-4"><div className="size-11 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center text-white font-bold">ФР</div><div><b className="text-sm">Friday ✓</b><div className="text-xs text-zinc-500">2 мин назад · онлайн</div></div></div>
          <p className="text-[15px] leading-relaxed">Только что Легион сделал саммари нашего чата на 200 сообщений за 3 секунды. Я в шоке. 🤯</p>
          <div className="flex gap-5 mt-4 text-sm text-zinc-500 font-semibold"><span>❤️ 128</span><span>💬 24</span><span>🔁 11</span></div>
        </Tilt>
      </div>
    </section>

    <section id="free" className="max-w-6xl mx-auto px-5 py-24 text-center">
      <h2 className="gs-reveal font-display text-3xl md:text-5xl font-bold">Один тариф. <span className="text-gradient">Ноль рублей.</span></h2>
      <div className="gs-reveal mt-10 inline-block glass rounded-3xl p-8 md:p-10 shadow-2xl text-left min-w-72">
        <div className="font-display text-5xl font-bold">0 ₽<span className="text-lg text-zinc-500 font-sans font-semibold">/навсегда</span></div>
        <ul className="mt-6 flex flex-col gap-3 font-semibold text-[15px]">
          {['Все 45 функций', 'Безлимит сообщений и постов', 'AI на бесплатном Agnes', 'Голос без ограничений'].map(t => <li key={t} className="flex gap-2.5 items-center"><Check size={17} className="text-emerald-500" />{t}</li>)}
        </ul>
        <Link href="/register" className="mt-8 block text-center rounded-2xl bg-blue-600 text-white font-bold px-7 py-3.5 shadow-xl shadow-blue-600/30 hover:bg-blue-500 transition">Забрать аккаунт</Link>
      </div>
    </section>

    <footer className="border-t border-zinc-200 dark:border-white/10 py-10 text-center text-sm text-zinc-500">
      <b className="font-display tracking-widest text-zinc-700 dark:text-zinc-300">LEGION</b> · сделано с ⚡ · {new Date().getFullYear()}
    </footer>
  </div>;
}
