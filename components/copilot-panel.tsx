'use client';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CopilotChat } from '@copilotkit/react-ui';
import { useCopilotReadable, useCopilotAction } from '@copilotkit/react-core';
import { X } from 'lucide-react';
import { useStore } from '@/lib/store';
import { usePathname, useRouter } from 'next/navigation';

export function CopilotPanel() {
  const open = useStore(s => s.copilotOpen);
  const setOpen = useStore(s => s.setCopilot);
  const path = usePathname();
  const router = useRouter();
  useCopilotReadable({ description: 'Текущая страница LEGION', value: path });
  useCopilotAction({
    name: 'navigate', description: 'Перейти на страницу',
    parameters: [{ name: 'href', type: 'string', description: 'Путь: /chat /feed /messages /voice /studio /memory /missions /stats /users /admin', required: true }],
    handler: async ({ href }: { href: string }) => { router.push(href); return 'Перешёл на ' + href; },
  });
  useCopilotAction({
    name: 'toggleTheme', description: 'Сменить светлую/тёмную тему',
    parameters: [],
    handler: async () => { useStore.getState().toggleTheme(); return 'Тему сменил'; },
  });
  return <AnimatePresence>
    {open && <motion.div initial={{ x: 380 }} animate={{ x: 0 }} exit={{ x: 380 }} transition={{ type: 'spring', stiffness: 380, damping: 40 }} className="fixed top-0 right-0 bottom-0 z-[65] w-full max-w-sm glass border-y-0 border-r-0 shadow-2xl flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-200 dark:border-white/10">
        <b className="text-sm">✨ Copilot-помощник</b>
        <span className="text-[10px] text-zinc-400 font-bold">знает страницу · умеет ходить</span>
        <button onClick={() => setOpen(false)} className="ml-auto p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10"><X size={16} /></button>
      </div>
      <div className="flex-1 min-h-0 [&>div]:h-full">
        <CopilotChat className="h-full" labels={{ title: 'LEGION Copilot', initial: 'Привет! Я вижу, где ты. Могу объяснить страницу, помочь с постом или отвести куда скажешь.' }} />
      </div>
    </motion.div>}
  </AnimatePresence>;
}
