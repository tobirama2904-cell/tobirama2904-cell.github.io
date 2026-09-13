'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Mic, Paperclip, Phone, PhoneOff, Smile, Reply, Pin, Search, Plus, Sparkles, Languages, Timer, ArrowLeft, Users, MessageSquare } from 'lucide-react';
import { supaBrowser, isCloud } from '@/lib/supabase/client';
import { useStore } from '@/lib/store';
import { Avatar, Button, Empty } from './ui/primitives';
import { Dialog } from './ui/overlays';
import { fmtTime, timeAgo, uid } from '@/lib/utils';
import { guestDB, saveGuest } from '@/lib/guest';
import { typingChannel } from '@/lib/realtime';
import { CallClient, type CallState } from '@/lib/webrtc';
import type { Conversation, Message } from '@/lib/supabase/types';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { DictateButton } from './dictate';
import { useSearchParams } from 'next/navigation';
import { seedFile, fetchMagnet } from '@/lib/hybrid/torrent';

const EMOJI = ['❤️', '👍', '🔥', '😂', '😮', '😢'];

export function Messenger() {
  const me = useStore(s => s.me);
  const cloud = isCloud() && me && !me.guest;
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactTo, setReactTo] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [disappear, setDisappear] = useState(0);
  const [showNew, setShowNew] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [newKind, setNewKind] = useState<'group' | 'channel'>('group');
  const [people, setPeople] = useState<{ id: string; name: string; avatar_url: string | null }[]>([]);
  const [callState, setCallState] = useState<CallState>('idle');
  const [peerName, setPeerName] = useState('');
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [reacts, setReacts] = useState<Record<string, Record<string, { n: number; mine: boolean }>>>({});
  const [peerMap, setPeerMap] = useState<Record<string, { name: string; avatar: string | null }>>({});
  const [showMembers, setShowMembers] = useState(false);
  const [members, setMembers] = useState<{ user_id: string; role: string; user: { name: string; avatar_url: string | null } }[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const callRef = useRef<CallClient | null>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const tpRef = useRef<ReturnType<typeof typingChannel> | null>(null);
  const lastType = useRef(0);
  const msgsRef = useRef<Message[]>([]);
  msgsRef.current = msgs;
  const [anim] = useAutoAnimate();

  const loadConvos = useCallback(async () => {
    if (!cloud) { const db = guestDB(); setConvos(db.convos); if (!active && db.convos[0]) setActive(db.convos[0].id); return; }
    const { data } = await supaBrowser().from('convo_members').select('convo:conversations(*)').eq('user_id', me!.id);
    const list = ((data || []).map((r: never) => (r as { convo: Conversation }).convo).filter(Boolean)) as Conversation[];
    setConvos(list);
    if (!active && list[0]) setActive(list[0].id);
    // имена собеседников для DM
    const dmIds = list.filter(c => c.kind === 'dm').map(c => c.id);
    if (dmIds.length) {
      const { data: mm } = await supaBrowser().from('convo_members').select('convo_id,user:profiles!convo_members_user_id_fkey(name,avatar_url)').in('convo_id', dmIds).neq('user_id', me!.id);
      const map: Record<string, { name: string; avatar: string | null }> = {};
      (mm || []).forEach((r: never) => { const x = r as { convo_id: string; user: { name: string; avatar_url: string | null } }; if (!map[x.convo_id]) map[x.convo_id] = { name: x.user.name, avatar: x.user.avatar_url }; });
      setPeerMap(map);
    }
  }, [cloud, me, active]);
  useEffect(() => { loadConvos(); }, [loadConvos]);

  const loadReacts = useCallback(async (ids: string[]) => {
    if (!cloud || !ids.length || !me) return;
    const { data } = await supaBrowser().from('reactions').select('message_id,emoji,user_id').in('message_id', ids);
    const agg: Record<string, Record<string, { n: number; mine: boolean }>> = {};
    (data || []).forEach((r: never) => {
      const x = r as { message_id: string; emoji: string; user_id: string };
      agg[x.message_id] = agg[x.message_id] || {};
      const e = agg[x.message_id][x.emoji] || { n: 0, mine: false };
      e.n++; if (x.user_id === me.id) e.mine = true;
      agg[x.message_id][x.emoji] = e;
    });
    setReacts(agg);
  }, [cloud, me]);

  const loadMsgs = useCallback(async () => {
    if (!active) return;
    if (!cloud) { setMsgs((guestDB().msgs[active] || []).filter(m => !m.disappear_at || new Date(m.disappear_at) > new Date())); return; }
    const sb = supaBrowser();
    // чистка своих протухших
    await sb.from('messages').delete().eq('convo_id', active).eq('sender_id', me!.id).lt('disappear_at', new Date().toISOString());
    const { data } = await sb.from('messages').select('*,sender:profiles!messages_sender_id_fkey(*)').eq('convo_id', active).order('created_at').limit(200);
    const alive = ((data || []) as Message[]).filter(m => !m.disappear_at || new Date(m.disappear_at) > new Date());
    setMsgs(alive as never[]);
    await sb.from('convo_members').update({ last_read: new Date().toISOString() }).eq('convo_id', active).eq('user_id', me!.id);
    loadReacts(alive.map(m => m.id));
  }, [active, cloud, me, loadReacts]);
  useEffect(() => { loadMsgs(); }, [loadMsgs]);
  useEffect(() => { bottom.current?.scrollIntoView(); }, [msgs.length]);

  // realtime messages + reactions + typing
  useEffect(() => {
    if (!cloud || !active) return;
    const sb = supaBrowser();
    const ch = sb.channel('msg:' + active).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `convo_id=eq.${active}` }, async payload => {
      const nm = payload.new as Message;
      if (nm.disappear_at && new Date(nm.disappear_at) <= new Date()) return;
      const { data } = await sb.from('messages').select('*,sender:profiles!messages_sender_id_fkey(*)').eq('id', nm.id).single();
      if (data) setMsgs(m => m.some(x => x.id === nm.id) ? m : [...m, data as never]);
    }).subscribe();
    const chr = sb.channel('react:' + active).on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => {
      loadReacts(msgsRef.current.map(m => m.id));
    }).subscribe();
    tpRef.current = typingChannel(active);
    tpRef.current.onType(p => { if (me && p.uid !== me.id) { setTyping(p.name); setTimeout(() => setTyping(''), 2500); } });
    return () => { sb.removeChannel(ch); sb.removeChannel(chr); tpRef.current?.close(); tpRef.current = null; };
  }, [cloud, active, me, loadReacts]);
  // incoming calls
  useEffect(() => {
    if (!cloud || !me) return;
    const c = new CallClient({ onState: (s, peer) => { setCallState(s); if (peer) setPeerName(peer); }, onRemoteStream: s => { if (remoteAudio.current) { remoteAudio.current.srcObject = s; remoteAudio.current.play().catch(() => {}); } }, onEnd: () => {} });
    c.listen(me.id); callRef.current = c;
    return () => c.destroy();
  }, [cloud, me]);

  const send = async (kind: Message['kind'] = 'text', text?: string, media?: string) => {
    const body = (text ?? input).trim();
    if (!body && !media) return;
    if (!active) return;
    setInput(''); setReplyTo(null);
    const dis = disappear > 0 ? new Date(Date.now() + disappear * 1000).toISOString() : null;
    if (!cloud) {
      const db = guestDB();
      const m: Message = { id: uid(), convo_id: active, sender_id: 'guest', kind, text: body, media_url: media || null, reply_to: replyTo?.id || null, disappear_at: dis, created_at: new Date().toISOString() };
      db.msgs[active] = [...(db.msgs[active] || []), m];
      db.convos = db.convos.map(c => c.id === active ? { ...c, last_msg: body.slice(0, 60), last_at: m.created_at } : c);
      saveGuest(db); setMsgs(db.msgs[active]); setConvos(db.convos);
      setTimeout(() => {
        const db2 = guestDB();
        const r: Message = { id: uid(), convo_id: active, sender_id: 'legion', kind: 'ai', text: 'Принято! В облачном режиме здесь отвечал бы живой человек.', media_url: null, reply_to: null, disappear_at: null, created_at: new Date().toISOString() };
        db2.msgs[active] = [...(db2.msgs[active] || []), r]; saveGuest(db2); setMsgs(db2.msgs[active]);
      }, 900);
      return;
    }
    await supaBrowser().from('messages').insert({ convo_id: active, sender_id: me!.id, kind, text: body, media_url: media || null, reply_to: replyTo?.id || null, disappear_at: dis });
  };
  const react = async (mid: string, emoji: string) => {
    setReactTo(null);
    if (!cloud || !me) return;
    const mine = reacts[mid]?.[emoji]?.mine;
    const sb = supaBrowser();
    if (mine) await sb.from('reactions').delete().eq('message_id', mid).eq('user_id', me.id).eq('emoji', emoji);
    else await sb.from('reactions').upsert({ message_id: mid, user_id: me.id, emoji }, { onConflict: 'message_id,user_id,emoji' });
    loadReacts(msgsRef.current.map(m => m.id));
  };
  const pin = async (m: Message) => {
    if (!cloud) return;
    await supaBrowser().from('messages').update({ pinned: !m.pinned }).eq('id', m.id);
    setMsgs(ms => ms.map(x => x.id === m.id ? { ...x, pinned: !x.pinned } : x));
  };
  const upload = async (f: File, kind: 'image' | 'video' | 'file' | 'voice') => {
    if (!cloud) { send(kind, f.name); return; }
    const path = `${me!.id}/${Date.now()}_${f.name}`;
    const { error } = await supaBrowser().storage.from('media').upload(path, f);
    if (error) { alert('Загрузка не удалась: ' + error.message); return; }
    const { data } = supaBrowser().storage.from('media').getPublicUrl(path);
    send(kind, f.name, data.publicUrl);
  };
  const toggleRec = async () => {
    if (rec) { rec.stop(); setRec(null); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(s);
      const chunks: Blob[] = [];
      mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        upload(new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' }), 'voice');
        s.getTracks().forEach(t => t.stop());
      };
      mr.start(); setRec(mr);
    } catch { alert('Нет доступа к микрофону'); }
  };
  const aiAction = async (mode: 'sum' | 'tr' | 'ask') => {
    const askQ = mode === 'ask' ? prompt('Вопрос Легиону по этой переписке:') : '';
    if (mode === 'ask' && !askQ) return;
    if (aiBusy || msgs.length === 0) return;
    setAiBusy(true);
    try {
      let key = ''; try { key = localStorage.getItem('legion-agnes-key') || ''; } catch {}
      const convo = msgs.slice(-30).map(m => `${m.sender?.name || ''}: ${m.text}`).join('\n');
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key || undefined, system: mode === 'sum' ? 'Сделай короткое саммари переписки по-русски: суть, решения, открытые вопросы.' : mode === 'tr' ? 'Переведи переписку на английский, сохраняя имена. Кратко.' : 'Ответь на вопрос по переписке ниже, по-русски, коротко.', prompt: (mode === 'ask' ? `Вопрос: ${askQ}\n\nПереписка:\n` : '') + convo.slice(0, 5000) }) });
      const j = await r.json();
      if (j.text) send('ai', (mode === 'sum' ? '📝 Саммари:\n' : mode === 'tr' ? '🌐 Перевод:\n' : '❓ Вопрос: ' + askQ + '\n\n') + j.text);
    } catch {}
    setAiBusy(false);
  };
  const openDm = async (uid2: string) => {
    setShowNew(false);
    if (!cloud || !me) return;
    const sb = supaBrowser();
    const { data: mine } = await sb.from('convo_members').select('convo_id').eq('user_id', me.id);
    const ids = (mine || []).map((m: { convo_id: string }) => m.convo_id);
    if (ids.length) {
      const { data: theirs } = await sb.from('convo_members').select('convo_id').eq('user_id', uid2).in('convo_id', ids);
      if (theirs?.[0]) { setActive((theirs[0] as { convo_id: string }).convo_id); return; }
    }
    const { data: c } = await sb.from('conversations').insert({ kind: 'dm', title: '' }).select().single();
    if (c) { await sb.from('convo_members').insert([{ convo_id: c.id, user_id: me.id }, { convo_id: c.id, user_id: uid2 }]); loadConvos(); setActive(c.id); }
  };
  const createGroup = async () => {
    if (!cloud || !me || !groupName.trim()) return;
    const sb = supaBrowser();
    const { data: c } = await sb.from('conversations').insert({ kind: newKind, title: groupName.trim(), owner_id: me.id }).select().single();
    if (c) { await sb.from('convo_members').insert({ convo_id: c.id, user_id: me.id, role: 'owner' }); setGroupName(''); setShowNew(false); loadConvos(); setActive(c.id); setShowMembers(true); }
  };
  const loadPeople = async () => {
    if (!cloud) return;
    const { data } = await supaBrowser().from('profiles').select('id,name,avatar_url').neq('id', me!.id).limit(30);
    setPeople((data || []) as never[]); setShowNew(true);
  };
  const openMembers = async () => {
    if (!cloud || !active) return;
    const { data } = await supaBrowser().from('convo_members').select('user_id,role,user:profiles!convo_members_user_id_fkey(name,avatar_url)').eq('convo_id', active);
    setMembers((data || []) as never[]);
    if (!people.length) { const { data: pp } = await supaBrowser().from('profiles').select('id,name,avatar_url').neq('id', me!.id).limit(30); setPeople((pp || []) as never[]); }
    setShowMembers(true);
  };
  const addMember = async (uid2: string) => {
    if (!cloud || !active) return;
    await supaBrowser().from('convo_members').insert({ convo_id: active, user_id: uid2, role: 'member' });
    openMembers();
  };
  const onType = () => {
    if (!cloud || !tpRef.current || !me) return;
    const now = Date.now();
    if (now - lastType.current < 2000) return;
    lastType.current = now;
    tpRef.current.send(me.id, me.name);
  };
  const activeConvo = convos.find(c => c.id === active);
  const filtered = search ? msgs.filter(m => m.text.toLowerCase().includes(search.toLowerCase())) : msgs;
  const pinned = msgs.filter(m => m.pinned).slice(-3);
  const convoName = (c: Conversation) => c.kind === 'dm' ? (peerMap[c.id]?.name || c.title || 'Диалог') : (c.title || 'Группа');
  const convoAva = (c: Conversation) => c.kind === 'dm' ? (peerMap[c.id]?.avatar || c.avatar_url) : c.avatar_url;

  return <div className="flex gap-3 h-[calc(100vh-9rem)] lg:h-[calc(100vh-4rem)]">
    <audio ref={remoteAudio} autoPlay className="hidden" />
    {/* list */}
    <div className={`w-full sm:w-72 shrink-0 flex-col gap-1 ${active ? 'hidden sm:flex' : 'flex'}`}>
      <div className="flex gap-2 mb-1">
        <Button className="flex-1" onClick={loadPeople} disabled={!cloud}><Plus size={15} /> Новый чат</Button>
      </div>
      {convos.length === 0 && <Empty icon="💬" title="Чатов нет" sub={cloud ? 'Начни первый диалог' : 'Гость: доступен чат с Легионом'} />}
      {convos.map(c => <button key={c.id} onClick={() => setActive(c.id)} className={`flex items-center gap-2.5 rounded-2xl p-2.5 text-left transition ${active === c.id ? 'bg-blue-600 text-white shadow-lg' : 'glass hover:border-blue-500/40'}`}>
        <Avatar src={convoAva(c)} name={convoName(c)} size={42} />
        <div className="min-w-0 flex-1"><div className="font-bold text-sm truncate">{c.kind === 'group' ? '👥 ' : ''}{convoName(c)}</div><div className={`text-xs truncate ${active === c.id ? 'text-white/70' : 'text-zinc-500'}`}>{c.last_msg || '…'}</div></div>
      </button>)}
    </div>
    {/* window */}
    <div className={`flex-1 min-w-0 flex-col glass rounded-2xl overflow-hidden ${active ? 'flex' : 'hidden sm:flex'}`}>
      {!activeConvo ? <Empty icon="◈" title="Выбери чат" /> : <>
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-zinc-200 dark:border-white/10">
          <button className="sm:hidden p-1" onClick={() => setActive(null)}><ArrowLeft size={18} /></button>
          <Avatar src={convoAva(activeConvo)} name={convoName(activeConvo)} size={36} />
          <div className="flex-1 min-w-0"><b className="text-sm">{convoName(activeConvo)}</b><div className="text-[11px] text-zinc-500">{typing ? `✍️ ${typing} печатает…` : activeConvo.kind === 'dm' ? 'личный чат' : activeConvo.kind}</div></div>
          {cloud && <>
            {activeConvo.kind !== 'dm' && <button title="Участники" onClick={openMembers} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500"><Users size={17} /></button>}
            <button title="Позвонить" onClick={() => callRef.current && me && active && (async () => {
              const { data } = await supaBrowser().from('convo_members').select('user_id').eq('convo_id', active).neq('user_id', me.id).limit(1).single();
              const to = (data as { user_id: string } | null)?.user_id;
              if (to) callRef.current!.call(me.id, me.name, to); else alert('Не нашёл собеседника');
            })()} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-emerald-500"><Phone size={17} /></button>
            <button title="Поиск" onClick={() => setShowSearch(!showSearch)} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500"><Search size={17} /></button>
            <button title="Саммари от AI" onClick={() => aiAction('sum')} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-violet-500"><Sparkles size={17} /></button>
            <button title="Спросить Легиона" onClick={() => aiAction('ask')} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-violet-500"><MessageSquare size={17} /></button>
            <button title="Перевод" onClick={() => aiAction('tr')} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-blue-500"><Languages size={17} /></button>
            <button title="Исчезающие" onClick={() => { const v = disappear ? 0 : 60; setDisappear(v); }} className={`p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 ${disappear ? 'text-amber-500' : 'text-zinc-500'}`}><Timer size={17} /></button>
          </>}
        </div>
        {pinned.length > 0 && <div className="px-4 py-1.5 border-b border-amber-500/20 bg-amber-500/5 flex flex-col gap-0.5">{pinned.map(p => <div key={p.id} className="text-xs truncate text-zinc-600 dark:text-zinc-300">📌 {p.text.slice(0, 90)}</div>)}</div>}
        {callState !== 'idle' && <div className="px-4 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center gap-2 text-sm font-bold text-emerald-600">
          {callState === 'calling' ? '📞 Вызываю…' : callState === 'ringing' ? `📞 Входящий от ${peerName}` : `🟢 Разговор${peerName ? ' с ' + peerName : ''}`}
          <span className="ml-auto flex gap-2">
            {callState === 'ringing' && <><Button size="sm" onClick={() => me && callRef.current?.accept(me.id, me.name)}>Принять</Button><Button size="sm" variant="outline" onClick={() => me && callRef.current?.decline(me.id, me.name)}>Сброс</Button></>}
            {(callState === 'calling' || callState === 'in-call') && <button onClick={() => callRef.current?.hangup()} className="p-2 rounded-full bg-rose-500 text-white"><PhoneOff size={15} /></button>}
          </span>
        </div>}
        {showSearch && <div className="px-4 py-2 border-b border-zinc-200 dark:border-white/10"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по сообщениям…" className="w-full h-9 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" /></div>}
        <div ref={anim} className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 chat-scroll">
          {filtered.map(m => {
            const mine2 = me && m.sender_id === me.id;
            const reply = m.reply_to ? msgs.find(x => x.id === m.reply_to) : null;
            const rc = reacts[m.id];
            return <div key={m.id} className={`group max-w-[85%] animate-[msgIn_.3s] ${mine2 ? 'self-end' : 'self-start'}`}>
              {!mine2 && <div className="text-[10px] font-bold text-zinc-400 mb-0.5 ml-1">{m.sender?.name || ''}</div>}
              {reply && <div className="text-xs text-zinc-500 border-l-2 border-blue-500 pl-2 ml-1 mb-1 truncate max-w-64">{reply.text.slice(0, 80)}</div>}
              <div className={`rounded-2xl px-3.5 py-2 text-[14.5px] leading-relaxed ${mine2 ? 'bg-blue-600 text-white rounded-br-md' : m.kind === 'ai' ? 'bg-violet-500/12 border border-violet-500/25 rounded-bl-md whitespace-pre-wrap' : 'bg-zinc-100 dark:bg-white/8 rounded-bl-md'}`}>
                {m.kind === 'image' && m.media_url && <img src={m.media_url} alt="" className="rounded-xl max-h-64 mb-1" />}
                {m.kind === 'video' && m.media_url && <video src={m.media_url} controls className="rounded-xl max-h-64 mb-1" />}
                {m.kind === 'voice' && m.media_url && <audio src={m.media_url} controls className="max-w-56 mb-1" />}
                {m.kind === 'file' && m.media_url && <a href={m.media_url} target="_blank" className="underline">📎 {m.text}</a>}
                {m.kind !== 'file' && <span className="whitespace-pre-wrap break-words">{m.text}</span>}
                {rc && <div className="flex gap-1 mt-1 flex-wrap">{Object.entries(rc).map(([e, v]) => <button key={e} onClick={() => react(m.id, e)} className={`text-xs rounded-full px-1.5 py-0.5 border ${v.mine ? 'border-blue-500 bg-blue-500/15' : 'border-zinc-300 dark:border-white/15'}`}>{e} {v.n}</button>)}</div>}
                <div className={`text-[10px] mt-0.5 text-right ${mine2 ? 'text-white/60' : 'text-zinc-400'}`}>{m.pinned ? '📌 ' : ''}{fmtTime(m.created_at)}{m.disappear_at ? ' ⏳' : ''}</div>
              </div>
              <div className="hidden group-hover:flex gap-0.5 mt-0.5 ml-1">
                <button onClick={() => setReactTo(reactTo === m.id ? null : m.id)} className="p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400"><Smile size={13} /></button>
                <button onClick={() => setReplyTo(m)} className="p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400"><Reply size={13} /></button>
                <button onClick={() => pin(m)} className={`p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 ${m.pinned ? 'text-amber-500' : 'text-zinc-400'}`}><Pin size={13} /></button>
              </div>
              {reactTo === m.id && <div className="flex gap-1 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-full px-2 py-1 w-fit shadow-lg">
                {EMOJI.map(e => <button key={e} onClick={() => react(m.id, e)} className="hover:scale-125 transition text-lg">{e}</button>)}
              </div>}
            </div>;
          })}
          <div ref={bottom} />
        </div>
        {replyTo && <div className="px-4 py-1.5 text-xs bg-zinc-100 dark:bg-white/5 flex items-center gap-2">↩️ {replyTo.text.slice(0, 60)}<button onClick={() => setReplyTo(null)} className="ml-auto font-bold">✕</button></div>}
        {disappear > 0 && <div className="px-4 py-1 text-[11px] font-bold text-amber-500">⏳ Сообщения исчезнут через {disappear} сек</div>}
        <div className="p-3 flex gap-2 border-t border-zinc-200 dark:border-white/10">
          <label className="size-11 grid place-items-center rounded-xl border border-zinc-200 dark:border-white/10 hover:border-blue-500 cursor-pointer transition" title="Файл">
            <Paperclip size={17} /><input type="file" hidden onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, f.type.startsWith('image') ? 'image' : f.type.startsWith('video') ? 'video' : 'file'); e.target.value = ''; }} />
          </label>
          <button onClick={toggleRec} className={`size-11 grid place-items-center rounded-xl border transition ${rec ? 'bg-rose-500 text-white border-rose-500 animate-pulse' : 'border-zinc-200 dark:border-white/10 hover:border-blue-500'}`} title="Голосовое"><Mic size={17} /></button>
          <DictateButton onText={t => setInput(v => (v ? v + ' ' : '') + t)} />
          <input value={input} onChange={e => { setInput(e.target.value); onType(); }} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Сообщение…" className="flex-1 h-11 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 outline-none focus:border-blue-500 font-medium" />
          <Button size="icon" className="!size-11 !rounded-xl" onClick={() => send()}><Send size={17} /></Button>
        </div>
      </>}
    </div>
    <Dialog open={showNew} onOpenChange={setShowNew} title="Новый чат">
      <div className="flex flex-col gap-1">
        <div className="flex gap-2 mb-2">
          <select value={newKind} onChange={e => setNewKind(e.target.value as 'group' | 'channel')} className="h-9 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 text-sm font-bold outline-none">
            <option value="group">👥 Группа</option><option value="channel">📣 Канал</option>
          </select>
          <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder={newKind === 'group' ? 'Название группы…' : 'Название канала…'} className="flex-1 h-9 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" />
          <Button size="sm" onClick={createGroup} disabled={!groupName.trim()}>Создать</Button>
        </div>
        <div className="text-[11px] font-bold text-zinc-400 mb-1">ЛИЧНЫЕ СООБЩЕНИЯ</div>
        {people.map(p => <button key={p.id} onClick={() => openDm(p.id)} className="flex items-center gap-2.5 rounded-xl p-2 hover:bg-zinc-100 dark:hover:bg-white/5 text-left"><Avatar src={p.avatar_url} name={p.name} size={36} /><b className="text-sm">{p.name}</b></button>)}
        {people.length === 0 && <div className="text-sm text-zinc-500">Никого нет. Пригласи друзей!</div>}
      </div>
    </Dialog>
    <Dialog open={showMembers} onOpenChange={setShowMembers} title="Участники">
      <div className="flex flex-col gap-1">
        {members.map(m => <div key={m.user_id} className="flex items-center gap-2.5 rounded-xl p-2"><Avatar src={m.user.avatar_url} name={m.user.name} size={32} /><b className="text-sm">{m.user.name}</b><span className="ml-auto text-[11px] text-zinc-400">{m.role}</span></div>)}
        <div className="text-[11px] font-bold text-zinc-400 mt-2 mb-1">ДОБАВИТЬ</div>
        {people.filter(p => !members.some(m => m.user_id === p.id)).map(p => <button key={p.id} onClick={() => addMember(p.id)} className="flex items-center gap-2.5 rounded-xl p-2 hover:bg-zinc-100 dark:hover:bg-white/5 text-left"><Avatar src={p.avatar_url} name={p.name} size={32} /><b className="text-sm">{p.name}</b><Plus size={14} className="ml-auto" /></button>)}
      </div>
    </Dialog>
  </div>;
}
