'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Mic, Paperclip, Phone, PhoneOff, Smile, Reply, Pin, Search, Plus, Sparkles, Languages, Timer, ArrowLeft, Users, MessageSquare, Video, Globe, Trash2, Forward, BarChart3, Link2, X, UserPlus, Check, Flame } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Avatar, Button, Empty } from './ui/primitives';
import { Dialog } from './ui/overlays';
import { fmtTime, timeAgo } from '@/lib/utils';
import { DictateButton } from './dictate';
import { useSearchParams } from 'next/navigation';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import {
  listConvos, ensureDm, createGroup, touchConvo, sendDm, sendGroup, sendNip29,
  listConvoMessages, subConvo, addMember, removeMember, listReacts, setReact, togglePin,
  listNip29, joinNip29, votePoll, getPollVotes, type ConvoEntry, type Nip29Group,
  listLegionChannels, joinLegionChannel, joinRoomById, type LegionChannel,
  readKeyDM, publishRead, getReadDM, getReadsRoom,
} from '@/lib/hybrid/dm';
import { directory, resolveAccount, getProfile } from '@/lib/hybrid/social';
import type { Profile } from '@/lib/supabase/types';
import { uploadFile } from '@/lib/hybrid/storage';
import { seedFile, fetchMagnet, isMagnet } from '@/lib/hybrid/torrent';
import { sendTyping, onTyping, onOnline, lastSeenMs } from '@/lib/hybrid/live';
import { CallClient, type CallState } from '@/lib/hybrid/calls';
import { loadBanlist, applyMod } from '@/lib/hybrid/banlist';
import { addTomb } from '@/lib/hybrid/social';
import { npublish } from '@/lib/hybrid/nostr';
import { loadSession } from '@/lib/hybrid/identity';
import type { Message } from '@/lib/supabase/types';

const EMOJI = ['❤️', '👍', '🔥', '😂', '😮', '😢'];
const dmPeerOf = (c: ConvoEntry): string => {
  if (c.kind !== 'dm') return '';
  const tail = c.id.slice(3);
  if (/^[0-9a-f]{64}$/i.test(tail)) return tail.toLowerCase();
  return c.peer || '';
};
const typeRoom = (c: ConvoEntry, me: string): string => {
  if (c.kind === 'dm') { const p = dmPeerOf(c); return 'dmtype:' + [me, p].sort().join(':'); }
  return 'gtype:' + c.id;
};
const alive = (m: Message) => !m.disappear_at || new Date(m.disappear_at).getTime() > Date.now();

export function Messenger() {
  const me = useStore(s => s.me);
  const myPub = me && !me.guest ? me.id : '';
  const params = useSearchParams();
  const [convos, setConvos] = useState<ConvoEntry[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const inputRef = useRef('');
  const DRAFTS_K = 'legion-drafts-v1';
  const [readDmAt, setReadDmAt] = useState<string | null>(null);
  const [roomReads, setRoomReads] = useState<Record<string, string>>({});
  const rxThrottle = useRef<Record<string, number>>({});
  const [recV, setRecV] = useState<MediaRecorder | null>(null);
  const [recVStream, setRecVStream] = useState<MediaStream | null>(null);
  const vPrevRef = useRef<HTMLVideoElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [typing, setTyping] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactTo, setReactTo] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [disappear, setDisappear] = useState(0);
  const [showNew, setShowNew] = useState(false);
  const [showNip29, setShowNip29] = useState(false);
  const [nip29list, setNip29list] = useState<Nip29Group[]>([]);
  const [legionCh, setLegionCh] = useState<LegionChannel[]>([]);
  const [catQ, setCatQ] = useState('');
  const [groupName, setGroupName] = useState('');
  const [newKind, setNewKind] = useState<'group' | 'channel'>('group');
  const [people, setPeople] = useState<Profile[]>([]);
  const [peopleQ, setPeopleQ] = useState('');
  const [addId, setAddId] = useState('');
  const [addErr, setAddErr] = useState('');
  const [inviteCopied, setInviteCopied] = useState(false);
  const [callState, setCallState] = useState<CallState>('idle');
  const [peerName, setPeerName] = useState('');
  const [videoCall, setVideoCall] = useState(false);
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [upBusy, setUpBusy] = useState(false);
  const [reacts, setReacts] = useState<Record<string, Record<string, { n: number; mine: boolean }>>>({});
  const [profs, setProfs] = useState<Record<string, Profile>>({});
  const [showMembers, setShowMembers] = useState(false);
  const [online, setOnline] = useState<string[]>([]);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQ, setPollQ] = useState('');
  const [pollOpts, setPollOpts] = useState<string[]>(['', '']);
  const [pollVotes, setPollVotes] = useState<Record<string, { counts: number[]; mine: number; total: number }>>({});
  const [fwd, setFwd] = useState<Message | null>(null);
  const [amAdmin, setAmAdmin] = useState(false);
  const [torrentUrls, setTorrentUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [instantMode, setInstantMode] = useState(false);
  const [instantOpen, setInstantOpen] = useState<string[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const callRef = useRef<CallClient | null>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const lastType = useRef(0);
  const typeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgsRef = useRef<Message[]>([]);
  msgsRef.current = msgs;
  const activeRef = useRef<string | null>(null);
  activeRef.current = active;
  const [anim] = useAutoAnimate();

  const profOf = useCallback((id: string): Profile | undefined => profs[id], [profs]);
  const ensureProfs = useCallback(async (ids: string[]) => {
    const miss = [...new Set(ids)].filter(id => id && !profs[id]);
    if (!miss.length) return;
    const rows = await Promise.all(miss.slice(0, 30).map(id => getProfile(id).catch(() => null)));
    const add: Record<string, Profile> = {};
    rows.forEach(p => { if (p) add[p.id] = p; });
    if (Object.keys(add).length) setProfs(prev => ({ ...prev, ...add }));
  }, [profs]);

  const refreshConvos = useCallback(() => {
    setConvos(listConvos());
  }, []);
  // initial load + deep link ?dm=
  useEffect(() => {
    if (!myPub) return;
    refreshConvos();
    loadBanlist().then(bl => { if (bl.admins.includes(myPub)) setAmAdmin(true); }).catch(() => {});
    const dm = params.get('dm');
    if (dm && /^[0-9a-f]{64}$/i.test(dm) && dm.toLowerCase() !== myPub) {
      const c = ensureDm(dm.toLowerCase());
      touchConvo(c.id, '');
      refreshConvos();
      setActive(c.id);
    }
    const room = params.get('room');
    if (room && /^[A-Za-z0-9:_-]{3,120}$/.test(room)) {
      (async () => {
        try {
          const chs = await listLegionChannels();
          const hit = chs.find(x => x.room === room);
          if (hit) {
            const e = joinLegionChannel(hit);
            touchConvo(e.id, '');
            refreshConvos();
            setActive(e.id);
            setInput(loadDraft(e.id)); inputRef.current = loadDraft(e.id);
            return;
          }
        } catch {}
        try {
          const e = joinRoomById(room, 'group', '👥 Группа по ссылке');
          touchConvo(e.id, '');
          refreshConvos();
          setActive(e.id);
        } catch {}
      })();
    }
    const t = setInterval(refreshConvos, 5000);
    return () => clearInterval(t);
  }, [myPub, refreshConvos, params]);
  useEffect(() => onOnline(ids => setOnline(ids)), []);
  // live subscription for active convo + typing
  useEffect(() => {
    if (!myPub || !active) { setMsgs([]); return; }
    const c = listConvos().find(x => x.id === active);
    if (!c) { setMsgs([]); return; }
    let dead = false;
    setLoading(true);
    listConvoMessages(active).then(ms => {
      if (dead) return;
      setMsgs(ms.filter(alive));
      setLoading(false);
      ensureProfs(ms.map(m => m.sender_id));
    }).catch(() => setLoading(false));
    const off = subConvo(active, m => {
      if (!alive(m)) return;
      setMsgs(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
      ensureProfs([m.sender_id]);
      refreshConvos();
    });
    let offType = () => {};
    onTyping(typeRoom(c, myPub), (m: unknown) => {
      const mm = m as { payload?: { uid: string; name: string }; uid?: string; name?: string };
      const p = mm?.payload || mm;
      if (p && p.uid && p.uid !== myPub) {
        setTyping(p.name || '…');
        if (typeTimer.current) clearTimeout(typeTimer.current);
        typeTimer.current = setTimeout(() => setTyping(''), 3000);
      }
    }).then(o => { offType = o; }).catch(() => {});
    return () => { dead = true; off(); offType(); setTyping(''); };
  }, [active, myPub, ensureProfs, refreshConvos]);
  // reactions + poll votes lazy
  useEffect(() => {
    if (!msgs.length) return;
    listReacts(msgs.map(m => m.id)).then(rows => {
      const agg: Record<string, Record<string, { n: number; mine: boolean }>> = {};
      rows.forEach(r => {
        agg[r.message_id] = agg[r.message_id] || {};
        const e = agg[r.message_id][r.emoji] || { n: 0, mine: false };
        e.n++; if (r.user_id === myPub) e.mine = true;
        agg[r.message_id][r.emoji] = e;
      });
      setReacts(agg);
    }).catch(() => {});
    msgs.filter(m => m.kind === 'poll' && !pollVotes[m.id]).slice(0, 6).forEach(m => {
      getPollVotes(m.id).then(v => setPollVotes(prev => ({ ...prev, [m.id]: v }))).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs]);
  // read receipts: publish mine + fetch theirs (throttled)
  useEffect(() => {
    if (!active || !msgs.length || !myPub) return;
    const now = Date.now();
    if (now - (rxThrottle.current[active] || 0) < 15000 && msgs.length > 1) return;
    rxThrottle.current[active] = now;
    const c = (convos.find(x => x.id === active)) as ConvoEntry | undefined;
    if (!c) return;
    if (c.kind === 'dm') {
      const peer = dmPeerOf(c);
      if (!peer || peer === myPub) return;
      publishRead(readKeyDM(myPub, peer));
      getReadDM(peer).then(t => setReadDmAt(t)).catch(() => {});
    } else {
      publishRead(active);
      getReadsRoom(active).then(r => setRoomReads(r)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs, active]);
  useEffect(() => { setReadDmAt(null); setRoomReads({}); if (active) { const d = loadDraft(active); setInput(d); inputRef.current = d; } }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottom.current?.scrollIntoView(); }, [msgs.length]);
  // incoming calls
  useEffect(() => {
    if (!myPub) return;
    const c = new CallClient({
      onState: (s, peer) => { setCallState(s); if (peer) setPeerName(peer); },
      onRemoteStream: s => {
        const hasVideo = s.getVideoTracks().length > 0;
        setVideoCall(hasVideo);
        if (hasVideo && remoteVideo.current) { remoteVideo.current.srcObject = s; remoteVideo.current.play().catch(() => {}); }
        else if (remoteAudio.current) { remoteAudio.current.srcObject = s; remoteAudio.current.play().catch(() => {}); }
      },
      onEnd: () => { setVideoCall(false); },
    });
    c.listen(myPub); callRef.current = c;
    return () => c.destroy();
  }, [myPub]);

  const activeConvo = convos.find(c => c.id === active) || null;
  const convoPeer = activeConvo ? dmPeerOf(activeConvo) : '';
  const convoName = (c: ConvoEntry) => {
    if (c.kind === 'dm') { const p = dmPeerOf(c); if (p && p === myPub) return '⭐ Избранное'; return profOf(p)?.name || (p ? 'nostr:' + p.slice(0, 8) : 'Диалог'); }
    return c.title || 'Группа';
  };
  const convoAva = (c: ConvoEntry) => {
    if (c.kind === 'dm') { const p = dmPeerOf(c); if (p && p === myPub) return profOf(myPub)?.avatar_url || c.avatar_url; return profOf(p)?.avatar_url || c.avatar_url; }
    return c.avatar_url;
  };
  useEffect(() => {
    if (convos.length) ensureProfs(convos.filter(c => c.kind === 'dm').map(dmPeerOf));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convos.length]);

  const saveDraft = (cid: string, v: string) => {
    try {
      const all = JSON.parse(localStorage.getItem(DRAFTS_K) || '{}') as Record<string, string>;
      if (v.trim()) all[cid] = v; else delete all[cid];
      localStorage.setItem(DRAFTS_K, JSON.stringify(all));
    } catch {}
  };
  const loadDraft = (cid: string): string => {
    try { return ((JSON.parse(localStorage.getItem(DRAFTS_K) || '{}') as Record<string, string>)[cid] || ''); } catch { return ''; }
  };
  const sendRouter = async (cid: string, f: { kind?: Message['kind']; text: string; media_url?: string | null; reply_to?: string | null; disappear_at?: string | null; instant?: boolean | null; round?: boolean | null }): Promise<Message | null> => {
    const c = listConvos().find(x => x.id === cid);
    if (!c) return null;
    if (c.kind === 'dm') { const p = dmPeerOf(c); return p ? sendDm(p, f) : null; }
    if (c.nip29) return sendNip29(cid, f.text);
    return sendGroup(cid, f);
  };
  const send = async () => {
    const body = input.trim();
    if ((!body && !replyTo) || !active) return;
    if (!body) return;
    setInput(''); inputRef.current = ''; if (active) saveDraft(active, ''); setReplyTo(null);
    const dis = disappear > 0 ? new Date(Date.now() + disappear * 1000).toISOString() : null;
    const m = await sendRouter(active, { kind: 'text', text: body, reply_to: replyTo?.id || null, disappear_at: dis }).catch(() => null);
    if (!m) alert('Не отправлено — проверь сеть');
    refreshConvos();
  };
  const sendPoll = async () => {
    if (!active || !pollQ.trim()) return;
    const opts = pollOpts.map(o => o.trim()).filter(Boolean);
    if (opts.length < 2) { alert('Нужно минимум 2 варианта'); return; }
    const m = await sendRouter(active, { kind: 'poll', text: JSON.stringify({ q: pollQ.trim().slice(0, 200), opts: opts.slice(0, 6) }) }).catch(() => null);
    if (m) { setPollOpen(false); setPollQ(''); setPollOpts(['', '']); refreshConvos(); }
    else alert('Не отправлено — проверь сеть');
  };
  const react = async (mid: string, emoji: string) => {
    setReactTo(null);
    if (!myPub) return;
    const mine = reacts[mid]?.[emoji]?.mine;
    await setReact(mid, emoji, !mine).catch(() => {});
    listReacts(msgsRef.current.map(m => m.id)).then(rows => {
      const agg: Record<string, Record<string, { n: number; mine: boolean }>> = {};
      rows.forEach(r => {
        agg[r.message_id] = agg[r.message_id] || {};
        const e = agg[r.message_id][r.emoji] || { n: 0, mine: false };
        e.n++; if (r.user_id === myPub) e.mine = true;
        agg[r.message_id][r.emoji] = e;
      });
      setReacts(agg);
    }).catch(() => {});
  };
  const pin = (m: Message) => {
    if (!active) return;
    togglePin(active, m.id);
    setMsgs(ms => ms.map(x => x.id === m.id ? { ...x, pinned: !x.pinned } : x));
  };
  const delMsg = async (m: Message) => {
    if (!myPub) return;
    const mine = m.sender_id === myPub;
    if (!mine && !amAdmin) return;
    if (!confirm(mine ? 'Удалить сообщение?' : 'Удалить чужое сообщение (админ)?')) return;
    try {
      const s = loadSession();
      if (s) await npublish({ kind: 5, content: 'del', tags: [['e', m.id]] }, s.sk).catch(() => {});
      addTomb(m.id);
      if (!mine && amAdmin) await applyMod('hide', m.id).catch(() => {});
    } catch {}
    setMsgs(prev => prev.filter(x => x.id !== m.id));
  };
  const doForward = async (cid: string) => {
    if (!fwd) return;
    await sendRouter(cid, { kind: fwd.kind === 'poll' ? 'text' : fwd.kind, text: fwd.text, media_url: fwd.media_url }).catch(() => {});
    setFwd(null);
    refreshConvos();
    setActive(cid);
  };
  const upload = async (f: File, kind: 'image' | 'video' | 'file' | 'voice', opts?: { round?: boolean }) => {
    if (!active) return;
    setUpBusy(true);
    try {
      let url: string;
      const instant = instantMode && (kind === 'image' || kind === 'video');
      if (f.size > 8_000_000 && !instant) {
        url = await seedFile(f); // big file -> P2P torrent magnet
      } else {
        url = await uploadFile(f);
      }
      const dis = instant ? new Date(Date.now() + 24 * 3600e3).toISOString() : null;
      await sendRouter(active, { kind, text: instant ? '👁‍🔥 Мгновение' : (kind === 'file' ? `📎 ${f.name}` : f.name), media_url: url, disappear_at: dis, instant: instant || null, round: opts?.round || null });
      if (instant) setInstantMode(false);
      refreshConvos();
    } catch {
      alert('Загрузка не удалась');
    }
    setUpBusy(false);
  };
  const openInstant = (m: Message) => {
    if (instantOpen.includes(m.id)) return;
    setInstantOpen(prev => [...prev, m.id]);
    setTimeout(() => {
      try {
        addTomb(m.id);
        const s = loadSession();
        if (s) npublish({ kind: 5, content: 'burn', tags: [['e', m.id]] }, s.sk).catch(() => {});
      } catch {}
      setMsgs(prev => prev.filter(x => x.id !== m.id));
      setInstantOpen(prev => prev.filter(x => x !== m.id));
    }, 8000);
  };
  const openSaved = () => {
    if (!myPub) return;
    const c = ensureDm(myPub);
    touchConvo(c.id, '');
    refreshConvos();
    setActive(c.id);
  };
  const shareRoom = async () => {
    if (!activeConvo || activeConvo.kind === 'dm') return;
    const url = (typeof location !== 'undefined' ? location.origin : 'https://tobirama2904-cell.github.io') + '/messages?room=' + activeConvo.id;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { prompt('Скопируй ссылку-приглашение:', url); }
  };
  const toggleRecV = async () => {
    if (recV) { recV.stop(); return; }
    if (!active) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 480 }, height: { ideal: 480 } }, audio: true });
      setRecVStream(stream);
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        upload(new File([blob], `circle_${Date.now()}.webm`, { type: 'video/webm' }), 'video', { round: true });
        stream.getTracks().forEach(t => t.stop());
        setRecVStream(null); setRecV(null);
      };
      mr.start(); setRecV(mr);
      setTimeout(() => { if (vPrevRef.current) vPrevRef.current.srcObject = stream; }, 50);
      setTimeout(() => { try { if (mr.state !== 'inactive') mr.stop(); } catch {} }, 60000);
    } catch { alert('Нет доступа к камере'); }
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
    if (aiBusy || msgs.length === 0 || !active) return;
    setAiBusy(true);
    try {
      let key = ''; try { key = localStorage.getItem('legion-agnes-key') || ''; } catch {}
      const convo = msgs.slice(-30).map(m => `${profOf(m.sender_id)?.name || ''}: ${m.text}`).join('\n');
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key || undefined, system: mode === 'sum' ? 'Сделай короткое саммари переписки по-русски: суть, решения, открытые вопросы.' : mode === 'tr' ? 'Переведи переписку на английский, сохраняя имена. Кратко.' : 'Ответь на вопрос по переписке ниже, по-русски, коротко.', prompt: (mode === 'ask' ? `Вопрос: ${askQ}\n\nПереписка:\n` : '') + convo.slice(0, 5000) }) });
      const j = await r.json();
      if (j.text) await sendRouter(active, { kind: 'ai', text: (mode === 'sum' ? '📝 Саммари:\n' : mode === 'tr' ? '🌐 Перевод:\n' : '❓ Вопрос: ' + askQ + '\n\n') + j.text });
      else alert('AI молчит (нужен Agnes-ключ)');
    } catch {}
    setAiBusy(false);
  };
  const openDm = (peer: string) => {
    if (!peer || peer === myPub) return;
    const c = ensureDm(peer);
    touchConvo(c.id, '');
    refreshConvos();
    setActive(c.id);
    setShowNew(false);
    ensureProfs([peer]);
  };
  const loadPeople = async () => {
    setShowNew(true);
    setPeople([]);
    try { setPeople(await directory(60)); } catch { setPeople([]); }
  };
  const addByAccount = async () => {
    const v = addId.trim();
    if (!v) return;
    setAddErr('');
    const pk = await resolveAccount(v).catch(() => null);
    if (!pk) { setAddErr('Не нашёл такой аккаунт (нужен npub1… / hex / name@domain)'); return; }
    if (pk === myPub) { setAddErr('Это ты сам'); return; }
    const p = await getProfile(pk).catch(() => null);
    if (!p) { setAddErr('Профиль не найден на релеях'); return; }
    setAddId('');
    openDm(pk);
  };
  const createNewGroup = () => {
    if (!groupName.trim()) return;
    const c = createGroup(newKind, groupName.trim());
    if (c) { setGroupName(''); setShowNew(false); refreshConvos(); setActive(c.id); if (newKind === 'group') setShowMembers(true); }
  };
  const loadCatalog = () => {
    listLegionChannels().then(setLegionCh).catch(() => {});
    listNip29().then(setNip29list).catch(() => {});
  };
  const openNip29dir = async () => {
    setShowNip29(true);
    setNip29list([]);
    setLegionCh([]);
    setCatQ('');
    loadCatalog();
  };
  const onType = () => {
    if (!myPub || !activeConvo || !me) return;
    const now = Date.now();
    if (now - lastType.current < 2500) return;
    lastType.current = now;
    sendTyping(typeRoom(activeConvo, myPub), { event: 'typing', payload: { uid: myPub, name: me.name } });
  };
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/messages?dm=${myPub}`);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 1600);
    } catch {}
  };
  const openTorrent = async (magnet: string) => {
    if (torrentUrls[magnet]) { window.open(torrentUrls[magnet], '_blank'); return; }
    try {
      const u = await fetchMagnet(magnet);
      setTorrentUrls(prev => ({ ...prev, [magnet]: u }));
      window.open(u, '_blank');
    } catch { alert('P2P-пиры недоступны (нужен онлайн-автор файла)'); }
  };
  const filtered = search ? msgs.filter(m => m.text.toLowerCase().includes(search.toLowerCase())) : msgs;
  const pinned = msgs.filter(m => m.pinned).slice(-3);
  const shownPeople = peopleQ ? people.filter(p => (p.name + p.id).toLowerCase().includes(peopleQ.toLowerCase())) : people;

  if (!me) return <Empty icon="💬" title="Загрузка…" />;
  if (me.guest) return <div><h1 className="font-display font-bold text-xl mb-3">Мессенджер</h1><Empty icon="💬" title="Войди, чтобы переписываться" sub="Мессенджер работает между настоящими аккаунтами сети" /></div>;

  return <div className="flex gap-3 h-[calc(100dvh-12rem)] lg:h-[calc(100vh-4rem)]">
    <audio ref={remoteAudio} autoPlay className="hidden" />
    {/* list */}
    <div className={`w-full sm:w-72 shrink-0 flex-col gap-1 ${active ? 'hidden sm:flex' : 'flex'}`}>
      <div className="flex gap-2 mb-1">
        <Button className="flex-1" onClick={loadPeople}><Plus size={15} /> Новый чат</Button>
        <Button variant="outline" title="Каталог: группы и каналы" onClick={openNip29dir}><Globe size={15} /></Button>
      </div>
      {convos.length === 0 && <Empty icon="💬" title="Чатов нет" sub="Нажми «Новый чат» — там живые люди сети" />}
      <div className="flex flex-col gap-1 overflow-y-auto">
        <button onClick={openSaved} className={`flex items-center gap-2.5 rounded-2xl p-2.5 text-left transition ${active === 'dm:' + myPub ? 'bg-blue-600 text-white shadow-lg' : 'glass hover:border-blue-500/40'}`}>
          <Avatar src={profOf(myPub)?.avatar_url} name="⭐ Избранное" size={42} />
          <div className="min-w-0 flex-1"><div className="font-bold text-sm truncate">⭐ Избранное</div>
            <div className={`text-xs truncate ${active === 'dm:' + myPub ? 'text-white/70' : 'text-zinc-500'}`}>Сохраняй важное</div></div>
        </button>
        {convos.map(c => {
          if (c.kind === 'dm' && dmPeerOf(c) === myPub) return null;
          const peer = dmPeerOf(c);
          const isOnline = peer ? online.includes(peer) : false;
          return <button key={c.id} onClick={() => setActive(c.id)} className={`flex items-center gap-2.5 rounded-2xl p-2.5 text-left transition ${active === c.id ? 'bg-blue-600 text-white shadow-lg' : 'glass hover:border-blue-500/40'}`}>
            <div className="relative shrink-0"><Avatar src={convoAva(c)} name={convoName(c)} size={42} />
              {c.kind === 'dm' && isOnline && <span className="absolute bottom-0 right-0 size-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-950" />}</div>
            <div className="min-w-0 flex-1"><div className="font-bold text-sm truncate">{c.kind === 'group' ? '👥 ' : c.kind === 'channel' ? '📣 ' : ''}{convoName(c)}</div>
              <div className={`text-xs truncate ${active === c.id ? 'text-white/70' : 'text-zinc-500'}`}>{c.last_at ? timeAgo(c.last_at) + ' · ' : ''}{c.last_msg || '…'}</div></div>
          </button>;
        })}
      </div>
    </div>
    {/* window */}
    <div className={`flex-1 min-w-0 flex-col glass rounded-2xl overflow-hidden ${active ? 'flex' : 'hidden sm:flex'}`}>
      {!activeConvo ? <Empty icon="◈" title="Выбери чат" /> : <>
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-zinc-200 dark:border-white/10">
          <button className="sm:hidden p-1" onClick={() => setActive(null)}><ArrowLeft size={18} /></button>
          <div className="relative"><Avatar src={convoAva(activeConvo)} name={convoName(activeConvo)} size={36} />
            {convoPeer && online.includes(convoPeer) && <span className="absolute bottom-0 right-0 size-3 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-950" />}</div>
          <div className="flex-1 min-w-0"><b className="text-sm">{convoName(activeConvo)}</b>
            <div className="text-[11px] text-zinc-500">{typing ? `✍️ ${typing} печатает…` : activeConvo.kind === 'dm' ? (convoPeer && (online.includes(convoPeer) ? 'онлайн' : lastSeenMs(convoPeer) ? 'был(а) ' + timeAgo(lastSeenMs(convoPeer)) : 'личный чат')) : activeConvo.kind === 'channel' ? '📣 канал' : `👥 ${activeConvo.members.length} уч.`}</div></div>
          {activeConvo.kind !== 'dm' && <button title="Участники" onClick={() => { ensureProfs(activeConvo.members.map(m => m.user_id)); setShowMembers(true); }} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500"><Users size={17} /></button>}
          {activeConvo.kind === 'dm' && convoPeer && <>
            <button title="Позвонить" onClick={() => me && callRef.current?.call(myPub, me.name, convoPeer)} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-emerald-500"><Phone size={17} /></button>
            <button title="Видеозвонок" onClick={() => me && callRef.current?.callVideo(myPub, me.name, convoPeer)} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-emerald-500"><Video size={17} /></button>
          </>}
          <button title="Поиск" onClick={() => setShowSearch(!showSearch)} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500"><Search size={17} /></button>
          <button title="Саммари от AI" onClick={() => aiAction('sum')} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-violet-500"><Sparkles size={17} /></button>
          <button title="Спросить Легиона" onClick={() => aiAction('ask')} className="hidden sm:block p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-violet-500"><MessageSquare size={17} /></button>
          <button title="Перевод" onClick={() => aiAction('tr')} className="hidden sm:block p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-blue-500"><Languages size={17} /></button>
          <button title={disappear ? `Исчезающие: ${disappear}с (выкл.)` : 'Исчезающие сообщения'} onClick={() => setDisappear(disappear ? 0 : 60)} className={`p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 ${disappear ? 'text-amber-500' : 'text-zinc-500'}`}><Timer size={17} /></button>
        </div>
        {pinned.length > 0 && <div className="px-4 py-1.5 border-b border-amber-500/20 bg-amber-500/5 flex flex-col gap-0.5">{pinned.map(p => <div key={p.id} className="text-xs truncate text-zinc-600 dark:text-zinc-300">📌 {p.text.slice(0, 90)}</div>)}</div>}
        {callState !== 'idle' && <div className="px-4 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center gap-2 text-sm font-bold text-emerald-600">
          {callState === 'calling' ? '📞 Вызываю…' : callState === 'ringing' ? `📞 Входящий от ${peerName}` : `🟢 Разговор${peerName ? ' с ' + peerName : ''}`}
          <span className="ml-auto flex gap-2">
            {callState === 'ringing' && <><Button size="sm" onClick={() => me && callRef.current?.accept(myPub, me.name)}>Принять</Button><Button size="sm" variant="outline" onClick={() => me && callRef.current?.decline(myPub, me.name)}>Сброс</Button></>}
            {(callState === 'calling' || callState === 'in-call') && <button onClick={() => callRef.current?.hangup()} className="p-2 rounded-full bg-rose-500 text-white"><PhoneOff size={15} /></button>}
          </span>
        </div>}
        {videoCall && callState === 'in-call' && <video ref={remoteVideo} autoPlay playsInline className="w-full max-h-64 bg-black object-contain" />}
        {showSearch && <div className="px-4 py-2 border-b border-zinc-200 dark:border-white/10"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по сообщениям…" className="w-full h-9 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" /></div>}
        <div ref={anim} className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 chat-scroll">
          {loading && <div className="text-sm text-zinc-500 text-center py-4 animate-pulse">Загружаю с релеев…</div>}
          {filtered.map(m => {
            const mine = m.sender_id === myPub;
            const reply = m.reply_to ? msgs.find(x => x.id === m.reply_to) : null;
            const rc = reacts[m.id];
            const cantDel = !mine && !amAdmin;
            let poll: { q: string; opts: string[] } | null = null;
            if (m.kind === 'poll') { try { const j = JSON.parse(m.text); if (j.q && Array.isArray(j.opts)) poll = j; } catch {} }
            const pv = pollVotes[m.id];
            return <div key={m.id} className={`group max-w-[88%] sm:max-w-[85%] animate-[msgIn_.3s] ${mine ? 'self-end' : 'self-start'}`}>
              {!mine && <div className="text-[10px] font-bold text-zinc-400 mb-0.5 ml-1">{profOf(m.sender_id)?.name || ''}</div>}
              {reply && <div className="text-xs text-zinc-500 border-l-2 border-blue-500 pl-2 ml-1 mb-1 truncate max-w-64">{reply.text.slice(0, 80)}</div>}
              <div className={`rounded-2xl px-3.5 py-2 text-[14.5px] leading-relaxed ${mine ? 'bg-blue-600 text-white rounded-br-md' : m.kind === 'ai' ? 'bg-violet-500/12 border border-violet-500/25 rounded-bl-md whitespace-pre-wrap' : m.kind === 'system' ? 'bg-amber-500/10 border border-amber-500/25 rounded-bl-md text-[13px]' : 'bg-zinc-100 dark:bg-white/8 rounded-bl-md'}`}>
                {m.instant && m.media_url && !mine && !instantOpen.includes(m.id) && <button onClick={() => openInstant(m)} className="flex flex-col items-center gap-1 rounded-xl bg-black/70 text-white px-6 py-5 mb-1 min-w-52">
                  <Flame size={28} className="text-orange-500" />
                  <b className="text-sm">👁‍🔥 Мгновение</b>
                  <span className="text-[11px] opacity-70">нажми — сгорит через 8 сек</span>
                </button>}
                {m.instant && m.media_url && !mine && instantOpen.includes(m.id) && <div className="text-[11px] font-bold text-orange-500 mb-1 animate-pulse">🔥 открыто — сейчас сгорит…</div>}
                {m.kind === 'image' && m.media_url && !(m.instant && !mine && !instantOpen.includes(m.id)) && (isMagnet(m.media_url)
                  ? <button onClick={() => openTorrent(m.media_url!)} className="underline">🧲 P2P-фото (нажми чтобы загрузить)</button>
                  : <img src={m.media_url} alt="" className="rounded-xl max-h-64 mb-1" />)}
                {m.kind === 'video' && m.media_url && !(m.instant && !mine && !instantOpen.includes(m.id)) && (isMagnet(m.media_url)
                  ? <button onClick={() => openTorrent(m.media_url!)} className="underline">🧲 P2P-видео (нажми чтобы загрузить)</button>
                  : (m.round
                    ? <video src={m.media_url} autoPlay muted loop playsInline onClick={e => { const v = e.currentTarget; v.muted = !v.muted; if (v.paused) v.play(); }} title="Кружок — нажми для звука" className="size-44 rounded-full object-cover mb-1 cursor-pointer border-2 border-blue-500/50" />
                    : <video src={m.media_url} controls className="rounded-xl max-h-64 mb-1" />))}
                {m.kind === 'voice' && m.media_url && (isMagnet(m.media_url)
                  ? <button onClick={() => openTorrent(m.media_url!)} className="underline">🧲 P2P-голосовое</button>
                  : <audio src={m.media_url} controls className="max-w-56 mb-1" />)}
                {m.kind === 'file' && m.media_url && (isMagnet(m.media_url)
                  ? <button onClick={() => openTorrent(m.media_url!)} className="underline">🧲 {m.text} (P2P)</button>
                  : <a href={m.media_url} target="_blank" className="underline">📎 {m.text}</a>)}
                {poll ? <div className="min-w-52">
                  <div className="font-bold mb-1.5">📊 {poll.q}</div>
                  {poll.opts.map((o, i) => {
                    const n = pv?.counts[i] || 0;
                    const pct = pv && pv.total > 0 ? Math.round(n / pv.total * 100) : 0;
                    const isMine = pv?.mine === i;
                    return <button key={i} onClick={() => votePoll(m.id, i).then(() => getPollVotes(m.id).then(v => setPollVotes(prev => ({ ...prev, [m.id]: v })))).catch(() => {})} className={`relative w-full text-left rounded-xl px-3 py-1.5 mb-1 text-sm font-semibold overflow-hidden border ${isMine ? 'border-emerald-500' : 'border-zinc-300 dark:border-white/15'}`}>
                      <span className="absolute inset-y-0 left-0 bg-blue-500/20" style={{ width: pct + '%' }} />
                      <span className="relative">{isMine ? '✅ ' : ''}{o} <span className="opacity-60">· {n}</span></span>
                    </button>;
                  })}
                  <div className="text-[11px] opacity-70">голосов: {pv?.total || 0}</div>
                </div> : m.kind !== 'file' && <span className="whitespace-pre-wrap break-words">{m.text}</span>}
                {rc && <div className="flex gap-1 mt-1 flex-wrap">{Object.entries(rc).map(([e, v]) => <button key={e} onClick={() => react(m.id, e)} className={`text-xs rounded-full px-1.5 py-0.5 border ${v.mine ? 'border-blue-500 bg-blue-500/15' : 'border-zinc-300 dark:border-white/15'}`}>{e} {v.n}</button>)}</div>}
                <div className={`text-[10px] mt-0.5 text-right ${mine ? 'text-white/60' : 'text-zinc-400'}`}>{m.pinned ? '📌 ' : ''}{fmtTime(m.created_at)}{m.disappear_at ? ' ⏳' : ''}{mine && activeConvo?.kind === 'dm' && (readDmAt && m.created_at <= readDmAt ? <span className="text-sky-300 font-bold"> ✓✓</span> : <span> ✓</span>)}{mine && activeConvo && activeConvo.kind !== 'dm' && (() => { const n = Object.entries(roomReads).filter(([pub, t]) => pub !== myPub && t >= m.created_at).length; return n > 0 ? <span> 👁{n}</span> : null; })()}</div>
              </div>
              <div className="flex sm:hidden group-hover:flex gap-0.5 mt-0.5 ml-1">
                <button onClick={() => setReactTo(reactTo === m.id ? null : m.id)} className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400"><Smile size={15} /></button>
                <button onClick={() => setReplyTo(m)} className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400"><Reply size={15} /></button>
                <button onClick={() => pin(m)} className={`p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 ${m.pinned ? 'text-amber-500' : 'text-zinc-400'}`}><Pin size={15} /></button>
                <button onClick={() => setFwd(m)} className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400"><Forward size={15} /></button>
                {!cantDel && <button onClick={() => delMsg(m)} className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400"><Trash2 size={15} /></button>}
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
        {upBusy && <div className="px-4 py-1 text-[11px] font-bold text-blue-500 animate-pulse">⬆ Загружаю файл…</div>}
        {instantMode && <div className="px-4 py-1 text-[11px] font-bold text-orange-500">👁‍🔥 Режим мгновения: следующее фото/видео сгорит после просмотра</div>}
        <div className="p-3 flex gap-2 border-t border-zinc-200 dark:border-white/10">
          <label className="size-11 grid place-items-center rounded-xl border border-zinc-200 dark:border-white/10 hover:border-blue-500 cursor-pointer transition shrink-0" title="Файл (большие — через P2P)">
            <Paperclip size={17} /><input type="file" hidden onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, f.type.startsWith('image') ? 'image' : f.type.startsWith('video') ? 'video' : f.type.startsWith('audio') ? 'voice' : 'file'); e.target.value = ''; }} />
          </label>
          <button onClick={toggleRec} className={`size-11 grid place-items-center rounded-xl border transition shrink-0 ${rec ? 'bg-rose-500 text-white border-rose-500 animate-pulse' : 'border-zinc-200 dark:border-white/10 hover:border-blue-500'}`} title="Голосовое"><Mic size={17} /></button>
          <button onClick={toggleRecV} className={`size-11 grid place-items-center rounded-xl border transition shrink-0 ${recV ? 'bg-rose-500 text-white border-rose-500 animate-pulse' : 'border-zinc-200 dark:border-white/10 hover:border-blue-500'}`} title="Видео-кружок"><Video size={17} /></button>
          <button onClick={() => setPollOpen(true)} className="size-11 grid place-items-center rounded-xl border border-zinc-200 dark:border-white/10 hover:border-blue-500 transition shrink-0" title="Опрос"><BarChart3 size={17} /></button>
          <button onClick={() => setInstantMode(!instantMode)} className={`size-11 grid place-items-center rounded-xl border transition shrink-0 ${instantMode ? 'bg-orange-500 text-white border-orange-500' : 'border-zinc-200 dark:border-white/10 hover:border-orange-500'}`} title="Мгновение: следующее фото/видео сгорит после просмотра"><Flame size={17} /></button>
          <DictateButton onText={t => setInput(v => (v ? v + ' ' : '') + t)} />
          <input value={input} onChange={e => { const v = e.target.value; setInput(v); inputRef.current = v; if (active) saveDraft(active, v); onType(); }} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Сообщение…" className="flex-1 min-w-0 h-11 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 outline-none focus:border-blue-500 font-medium" />
          <Button size="icon" className="!size-11 !rounded-xl shrink-0" onClick={send}><Send size={17} /></Button>
        </div>
      </>}
    </div>
    {/* new chat dialog */}
    <Dialog open={showNew} onOpenChange={setShowNew} title="Новый чат" wide>
      <div className="flex flex-col gap-1">
        <div className="flex gap-2 mb-2 flex-wrap">
          <select value={newKind} onChange={e => setNewKind(e.target.value as 'group' | 'channel')} className="h-9 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 text-sm font-bold outline-none">
            <option value="group">👥 Группа</option><option value="channel">📣 Канал</option>
          </select>
          <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder={newKind === 'group' ? 'Название группы…' : 'Название канала…'} className="flex-1 min-w-40 h-9 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" />
          <Button size="sm" onClick={createNewGroup} disabled={!groupName.trim()}>Создать</Button>
        </div>
        <div className="text-[11px] font-bold text-zinc-400 mb-1">ДОБАВИТЬ ПО АККАУНТУ</div>
        <div className="flex gap-2 mb-1">
          <input value={addId} onChange={e => setAddId(e.target.value)} onKeyDown={e => e.key === 'Enter' && addByAccount()} placeholder="npub1… / hex / name@domain" className="flex-1 h-9 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none font-mono" />
          <Button size="sm" onClick={addByAccount}><UserPlus size={14} /></Button>
        </div>
        {addErr && <div className="text-xs font-bold text-rose-500 mb-1">{addErr}</div>}
        <button onClick={copyInvite} className="flex items-center gap-2 text-xs font-bold text-blue-500 hover:underline mb-2"><Link2 size={13} /> {inviteCopied ? 'Ссылка-приглашение скопирована!' : 'Моя ссылка-приглашение'}</button>
        <div className="text-[11px] font-bold text-zinc-400 mb-1">ЛЮДИ LEGION</div>
        <input value={peopleQ} onChange={e => setPeopleQ(e.target.value)} placeholder="🔍 Поиск…" className="h-9 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none mb-1" />
        <div className="max-h-64 overflow-y-auto flex flex-col gap-0.5">
          {shownPeople.filter(p => p.id !== myPub).map(p => <button key={p.id} onClick={() => openDm(p.id)} className="flex items-center gap-2.5 rounded-xl p-2 hover:bg-zinc-100 dark:hover:bg-white/5 text-left">
            <div className="relative"><Avatar src={p.avatar_url} name={p.name} size={36} />{online.includes(p.id) && <span className="absolute bottom-0 right-0 size-3 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-950" />}</div>
            <div className="min-w-0"><b className="text-sm">{p.name}</b><div className="text-[11px] text-zinc-500 truncate">{p.status || '—'}</div></div>
          </button>)}
          {shownPeople.length === 0 && <div className="text-sm text-zinc-500 py-3 text-center">Загружаю людей…</div>}
        </div>
      </div>
    </Dialog>
    {/* members dialog */}
    <Dialog open={showMembers} onOpenChange={setShowMembers} title="Участники">
      <div className="flex flex-col gap-1">
        {activeConvo && activeConvo.kind !== 'dm' && <button onClick={shareRoom} className="h-10 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-500 transition mb-1">{copied ? '✓ Ссылка скопирована' : '🔗 Пригласить: скопировать ссылку'}</button>}
        {(activeConvo?.members || []).map(m => <div key={m.user_id} className="flex items-center gap-2.5 rounded-xl p-2">
          <Avatar src={profOf(m.user_id)?.avatar_url} name={profOf(m.user_id)?.name || '?'} size={32} />
          <b className="text-sm">{profOf(m.user_id)?.name || m.user_id.slice(0, 10)}{m.user_id === myPub ? ' (ты)' : ''}</b>
          <span className="ml-auto text-[11px] text-zinc-400">{m.role}</span>
          {activeConvo && activeConvo.owner_id === myPub && m.user_id !== myPub && <button onClick={() => { removeMember(activeConvo.id, m.user_id); refreshConvos(); }} className="text-rose-500 text-xs font-bold">убрать</button>}
        </div>)}
        {activeConvo && activeConvo.kind !== 'dm' && !activeConvo.nip29 && <>
          <div className="text-[11px] font-bold text-zinc-400 mt-2 mb-1">ДОБАВИТЬ</div>
          <input value={peopleQ} onChange={e => setPeopleQ(e.target.value)} placeholder="🔍 Поиск…" className="h-9 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none mb-1" />
          {people.length === 0 && <button onClick={loadPeople} className="text-xs font-bold text-blue-500">Загрузить людей</button>}
          {people.filter(p => p.id !== myPub && !activeConvo.members.some(m => m.user_id === p.id)).filter(p => !peopleQ || (p.name + p.id).toLowerCase().includes(peopleQ.toLowerCase())).slice(0, 20).map(p => <button key={p.id} onClick={() => { addMember(activeConvo.id, p.id); refreshConvos(); ensureProfs([p.id]); }} className="flex items-center gap-2.5 rounded-xl p-2 hover:bg-zinc-100 dark:hover:bg-white/5 text-left">
            <Avatar src={p.avatar_url} name={p.name} size={32} /><b className="text-sm">{p.name}</b><Plus size={14} className="ml-auto" />
          </button>)}
        </>}
      </div>
    </Dialog>
    {/* NIP-29 directory */}
    <Dialog open={showNip29} onOpenChange={setShowNip29} title="🌐 Каталог · группы и каналы">
      <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto">
        <div className="flex gap-2"><input value={catQ} onChange={e => setCatQ(e.target.value)} placeholder="🔍 Найти группу или канал…" className="flex-1 h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3.5 text-sm outline-none" /><Button variant="outline" size="sm" title="Обновить каталог" onClick={loadCatalog}>↻</Button></div>
        <div className="text-[11px] font-bold tracking-widest text-zinc-400 mt-1">LEGION · НАШИ</div>
        {legionCh.filter(c => !catQ.trim() || c.title.toLowerCase().includes(catQ.trim().toLowerCase())).map(c => <div key={c.room} className="flex items-center gap-2.5 rounded-2xl border border-zinc-200 dark:border-white/10 p-3">
          <div className="min-w-0 flex-1"><b className="text-sm">{c.kind === 'channel' ? '📣 ' : '👥 '}{c.title}</b><div className="text-xs text-zinc-500 truncate">{c.kind === 'channel' ? 'канал' : 'группа'} · {c.room.slice(0, 18)}…</div></div>
          <Button size="sm" onClick={() => { const ch = joinLegionChannel(c); refreshConvos(); setActive(ch.id); setShowNip29(false); }}>Войти</Button>
        </div>)}
        {legionCh.length === 0 && <div className="text-sm text-zinc-500 text-center py-2">Ищу наши каналы на релеях…</div>}
        <div className="text-[11px] font-bold tracking-widest text-zinc-400 mt-1">NOSTR · ПУБЛИЧНЫЕ (NIP-29)</div>
        {nip29list.filter(g => !catQ.trim() || (g.name + g.about).toLowerCase().includes(catQ.trim().toLowerCase())).map(g => <div key={g.relay + g.id} className="flex items-center gap-2.5 rounded-2xl border border-zinc-200 dark:border-white/10 p-3">
          <div className="min-w-0 flex-1"><b className="text-sm">{g.name}</b><div className="text-xs text-zinc-500 truncate">{g.about || g.relay}</div></div>
          <Button size="sm" onClick={() => { const c = joinNip29(g); refreshConvos(); setActive(c.id); setShowNip29(false); }}>Войти</Button>
        </div>)}
        {nip29list.length === 0 && <div className="text-sm text-zinc-500 text-center py-2">Загружаю NIP-29…</div>}
      </div>
    </Dialog>
    {/* poll composer */}
    <Dialog open={pollOpen} onOpenChange={setPollOpen} title="📊 Новый опрос">
      <div className="flex flex-col gap-2">
        <input value={pollQ} onChange={e => setPollQ(e.target.value)} placeholder="Вопрос…" className="h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none font-bold" />
        {pollOpts.map((o, i) => <div key={i} className="flex gap-2">
          <input value={o} onChange={e => setPollOpts(prev => prev.map((x, j) => j === i ? e.target.value : x))} placeholder={`Вариант ${i + 1}`} className="flex-1 h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" />
          {pollOpts.length > 2 && <button onClick={() => setPollOpts(prev => prev.filter((_, j) => j !== i))} className="p-2 text-zinc-400"><X size={15} /></button>}
        </div>)}
        {pollOpts.length < 6 && <button onClick={() => setPollOpts(prev => [...prev, ''])} className="text-xs font-bold text-blue-500 self-start">＋ вариант</button>}
        <Button onClick={sendPoll}>Опубликовать опрос</Button>
      </div>
    </Dialog>
    {/* forward picker */}
    <Dialog open={!!recV} onOpenChange={v => { if (!v && recV) recV.stop(); }} title="⏺ Видео-кружок">
      <div className="flex flex-col items-center gap-3">
        <video ref={vPrevRef} autoPlay muted playsInline className="size-56 rounded-full object-cover bg-black" />
        <button onClick={() => recV?.stop()} className="h-11 px-6 rounded-xl bg-rose-500 text-white font-bold">⏹ Стоп и отправить</button>
      </div>
    </Dialog>
    <Dialog open={!!fwd} onOpenChange={v => !v && setFwd(null)} title="Переслать в…">
      <div className="flex flex-col gap-0.5 max-h-72 overflow-y-auto">
        {convos.filter(c => c.id !== active).map(c => <button key={c.id} onClick={() => doForward(c.id)} className="flex items-center gap-2.5 rounded-xl p-2 hover:bg-zinc-100 dark:hover:bg-white/5 text-left">
          <Avatar src={convoAva(c)} name={convoName(c)} size={34} /><b className="text-sm truncate">{convoName(c)}</b><Check size={14} className="ml-auto text-zinc-300" />
        </button>)}
        {convos.filter(c => c.id !== active).length === 0 && <div className="text-sm text-zinc-500 text-center py-3">Некуда — создай ещё чат</div>}
      </div>
    </Dialog>
  </div>;
}
