'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from './ui/primitives';

const STEPS = [
  { t: 'Добро пожаловать в LEGION ◈', d: 'AI-соцсеть: чаты, лента, мессенджер и голосовой помощник. Листани тур за 20 секунд.' },
  { t: '⌘K — твой телепорт', d: 'Нажми Ctrl/⌘+K: мгновенный поиск по страницам и действиям.' },
  { t: '🎙 Скажи «Легион»', d: 'Кнопка микрофона справа сверху — голосовое управление всем сайтом.' },
  { t: '✨ Copilot сбоку', d: 'Фиолетовая кнопка в меню — помощник, который видит твою страницу.' },
  { t: '👥 Зови друзей', d: 'Зарегистрируйся — и появятся люди, чаты, звонки. Всё бесплатно.' },
];
export function Onboarding() {
  const [i, setI] = useState(-1);
  useEffect(() => {
    try { if (!localStorage.getItem('legion-onboarded')) setI(0); } catch { setI(0); }
  }, []);
  const close = () => { try { localStorage.setItem('legion-onboarded', '1'); } catch {} setI(-1); };
  return <AnimatePresence>
    {i >= 0 && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={close}>
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} key={i} className="glass rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="text-5xl mb-4">{['◈', '⌘', '🎙', '✨', '👥'][i]}</div>
        <b className="font-display">{STEPS[i].t}</b>
        <p className="text-sm text-zinc-500 mt-2 leading-relaxed">{STEPS[i].d}</p>
        <div className="flex gap-1.5 justify-center mt-4">{STEPS.map((_, j) => <span key={j} className={`h-1.5 rounded-full transition-all ${j === i ? 'w-6 bg-blue-600' : 'w-1.5 bg-zinc-300 dark:bg-white/20'}`} />)}</div>
        <div className="flex gap-2 mt-5">
          <Button variant="ghost" className="flex-1" onClick={close}>Пропустить</Button>
          <Button className="flex-1" onClick={() => i < STEPS.length - 1 ? setI(i + 1) : close()}>Далее <ArrowRight size={15} /></Button>
        </div>
      </motion.div>
    </motion.div>}
  </AnimatePresence>;
}
