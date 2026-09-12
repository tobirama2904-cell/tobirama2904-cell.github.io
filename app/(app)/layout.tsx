'use client';
import { Sidebar, NotifBell } from '@/components/sidebar';
import { Cmdk } from '@/components/cmdk';
import { CopilotPanel } from '@/components/copilot-panel';
import { VoiceWidget } from '@/components/voice-widget';
import { Onboarding } from '@/components/onboarding';
import { useStore } from '@/lib/store';
import { Mic } from 'lucide-react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const setVoice = useStore(s => s.setVoice);
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
  </div>;
}
