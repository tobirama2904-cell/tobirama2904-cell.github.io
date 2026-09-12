'use client';
import { create } from 'zustand';
import type { Profile } from './supabase/types';

interface Me { id: string; email: string; name: string; avatar: string | null; role: string; guest: boolean; }
interface State {
  me: Me | null; profile: Profile | null; cloud: boolean;
  theme: 'light' | 'dark';
  voiceOpen: boolean; cmdkOpen: boolean; copilotOpen: boolean;
  setMe: (m: Me | null) => void; setProfile: (p: Profile | null) => void;
  setCloud: (c: boolean) => void; toggleTheme: () => void;
  setVoice: (v: boolean) => void; setCmdk: (v: boolean) => void; setCopilot: (v: boolean) => void;
}
function initTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  const s = localStorage.getItem('legion-theme');
  if (s === 'light' || s === 'dark') return s;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
export const useStore = create<State>((set, get) => ({
  me: null, profile: null, cloud: false, theme: initTheme(),
  voiceOpen: false, cmdkOpen: false, copilotOpen: false,
  setMe: me => set({ me }), setProfile: profile => set({ profile }),
  setCloud: cloud => set({ cloud }),
  toggleTheme: () => { const t = get().theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('legion-theme', t); } catch {} set({ theme: t }); },
  setVoice: voiceOpen => set({ voiceOpen }), setCmdk: cmdkOpen => set({ cmdkOpen }), setCopilot: copilotOpen => set({ copilotOpen }),
}));
export function applyTheme(t: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', t === 'dark');
  document.documentElement.style.colorScheme = t;
}
