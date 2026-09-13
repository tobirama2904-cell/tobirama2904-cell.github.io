'use client';
// Гостевой офлайн-режим: всё работает локально, пока не подключён Supabase.
import type { Post, Conversation, Message, Profile } from './supabase/types';

const K = 'legion-guest-v1';
interface GuestDB { name: string; posts: Post[]; convos: Conversation[]; msgs: Record<string, Message[]>; }
function blank(): GuestDB {
  const me: Profile = { id: 'guest', email: '', name: 'Гость', avatar_url: null, cover_url: null, bio: '', status: 'offline', role: 'user', verified: false, is_private: false, last_seen: new Date().toISOString(), created_at: new Date().toISOString() };
  return {
    name: 'Гость',
    posts: [
      { id: 'g1', author_id: 'legion', text: 'Добро пожаловать в LEGION! Это гостевой режим — создай бесплатный проект Supabase, и здесь оживут люди, чаты и лента.', image_url: null, likes: 42, comments: 3, reposts: 7, created_at: new Date(Date.now() - 3600e3).toISOString(), author: { ...me, id: 'legion', name: 'LEGION', verified: true } },
    ],
    convos: [{ id: 'gc1', kind: 'dm', title: 'LEGION', avatar_url: null, owner_id: null, created_at: new Date().toISOString(), last_msg: 'Привет! Я тут.', last_at: new Date().toISOString() }],
    msgs: { gc1: [{ id: 'gm1', convo_id: 'gc1', sender_id: 'legion', kind: 'ai', text: 'Привет! Зарегистрируйся — и сможешь переписываться с настоящими людьми.', media_url: null, reply_to: null, disappear_at: null, created_at: new Date().toISOString() }] },
  };
}
export function guestDB(): GuestDB {
  try { const raw = localStorage.getItem(K); if (raw) return { ...blank(), ...JSON.parse(raw) }; } catch {}
  return blank();
}
export function saveGuest(db: GuestDB) { try { localStorage.setItem(K, JSON.stringify(db)); } catch {} }
