'use client';
import { Sidebar, NotifBell } from '@/components/sidebar';
import { Cmdk } from '@/components/cmdk';
import { CopilotPanel } from '@/components/copilot-panel';
import { VoiceWidget } from '@/components/voice-widget';
import { Onboarding } from '@/components/onboarding';
import { useStore } from '@/lib/store';
import { Mic, Sparkles } from 'lucide-react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const setVoice = useStore(s => s.setVoice);
  const setCopilot = useStore(s => s.setCopilot);
  const copilotOpen = useStore(s => s.copilotOpen);
  return <div className="flex min-h-screen bg-zinc-50 dark:bg-[#05060a]">
    <Sidebar />
    <main className="flex-1 min-w-0 max-w-5xl mx-auto px-3 sm:px-6 py-4 pb-24 lg:pb-8">
      <div className="flex justify-end mb-3 gap-2">
        <button onClick={() => setVoice(true)} className="size-10 grid place-items-center rounded-xl border border-zinc-200 dark:border-white/10 hover:border-blue-500 transition" title="Голосовой помощник"><Mic size={17} /></button>
        <NotifBell />
      </div>
      {children}
    </main>
    <Cmdk /><CopilotPanel /><VoiceWidget /><Onboarding />
    {!copilotOpen && <button onClick={() => setCopilot(true)} title="Copilot-помощник"
      className="fixed z-40 right-3 bottom-[4.7rem] lg:right-6 lg:bottom-6 size-13 w-[52px] h-[52px] grid place-items-center rounded-2xl text-white bg-gradient-to-br from-violet-600 to-blue-500 shadow-xl shadow-violet-600/30 hover:scale-105 active:scale-95 transition">
      <Sparkles size={22} />
      <span className="absolute inset-0 rounded-2xl border-2 border-violet-400/60 animate-ping [animation-duration:2.4s]" />
    </button>}
  </div>;
}
