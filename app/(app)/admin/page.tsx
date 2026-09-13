'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, Users, Activity, Flag, Megaphone, Eye, Check, X, Ban, BadgeCheck, Send, KeyRound } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Avatar, Button, Empty } from '@/components/ui/primitives';
import { Tabs } from '@/components/ui/overlays';
import { MsgChart } from '@/components/charts';
import { timeAgo } from '@/lib/utils';
import {
  directory, searchProfiles, searchPosts, getProfile, getPosts, deletePost, getReports,
  resolveReportLocal, publishAnnouncement, getActivity, relayHealth,
  announceAdmin, listBots, createBot, setBotPublic, deleteBotAny,
  type ActItem, type BotRow,
} from '@/lib/hybrid/social';
import { readGhostDMs, listConvos } from '@/lib/hybrid/dm';
import { onOnline } from '@/lib/hybrid/live';
import { loadBanlist, applyMod, publishNow } from '@/lib/hybrid/banlist';
import { addTomb } from '@/lib/hybrid/social';
import type { Profile, Post, Report } from '@/lib/supabase/types';

type GhostGroup = { key: string; a: string; b: string; msgs: { id: string; sender: string; peer: string; kind: string; text: string; media: string | null; created_at: string }[] };

export default function AdminPage() {
  const me = useStore(s => s.me);
  const [tab, setTab] = useState('dash');
  const [users, setUsers] = useState<Profile[]>([]);
  const [acts, setActs] = useState<{ id: string; uid: string; type: string; text: string; at: string }[]>([]);
  const [actFilter, setActFilter] = useState('all');
  const [actUser, setActUser] = useState('');
  const [sq, setSq] = useState('');
  const [sUsers, setSUsers] = useState<Profile[]>([]);
  const [sPosts, setSPosts] = useState<Post[]>([]);
  const [sBusy, setSBusy] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [counts, setCounts] = useState({ users: 0, posts: 0, open: 0, ghosts: 0 });
  const [q, setQ] = useState('');
  const [ann, setAnn] = useState({ title: '', body: '' });
  const [ghosts, setGhosts] = useState<GhostGroup[]>([]);
  const [ghostNames, setGhostNames] = useState<Record<string, string>>({});
  const [auditKey, setAuditKey] = useState('');
  const [series, setSeries] = useState<{ d: string; msg: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [ghToken, setGhToken] = useState('');
  const [ghMsg, setGhMsg] = useState('');
  const [tg, setTg] = useState({ bot: '', token: '', chat: '' });
  const [bl, setBl] = useState<{ admins: string[]; banned: string[]; verified: string[]; hidden: string[] } | null>(null);
  const [health, setHealth] = useState<{ url: string; ms: number }[]>([]);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [bots, setBots] = useState<BotRow[]>([]);
  const [nb, setNb] = useState({ name: '', persona: '', system: '', pub: true });
  const [pattern, setPattern] = useState('');
  const [annMsg, setAnnMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dirs, reps, ghs, blist, actsMerged, botsAll] = await Promise.all([
        directory(120).catch(() => []),
        getReports().catch(() => []),
        readGhostDMs().catch(() => []),
        loadBanlist().catch(() => null),
        getActivity(80).catch(() => [] as ActItem[]),
        listBots(true).catch(() => [] as BotRow[]),
      ]);
      const ps = await getPosts({ limit: 60 }).catch(() => []);
      // users = directory + registry DM-peers + ghost parties + activity authors
      const extraIds = new Set<string>();
      try {
        listConvos().filter(c => c.kind === 'dm').forEach(c => {
          const tail = c.id.slice(3);
          const peer = /^[0-9a-f]{64}$/i.test(tail) ? tail.toLowerCase() : (c.peer || '');
          if (peer) extraIds.add(peer);
        });
      } catch {}
      ghs.flatMap(g => [g.a, g.b]).forEach(id => extraIds.add(id));
      actsMerged.forEach(a => extraIds.add(a.uid));
      const have = new Set(dirs.map(d => d.id));
      const miss = [...extraIds].filter(id => id && !have.has(id)).slice(0, 60);
      const mrows = await Promise.all(miss.map(id => getProfile(id).catch(() => null)));
      const allUsers = [...dirs];
      mrows.forEach(p => { if (p && !have.has(p.id)) { allUsers.push(p); have.add(p.id); } });
      setUsers(allUsers);
      setReports(reps.filter(r => r.status === 'open'));
      setGhosts(ghs);
      setBots(botsAll);
      if (blist) setBl({ admins: blist.admins, banned: blist.banned, verified: blist.verified, hidden: blist.hidden || [] });
      setActs(actsMerged.map(a => ({ id: a.id, uid: a.uid, type: a.type, text: a.text, at: a.at })));
      setCounts({ users: allUsers.length, posts: ps.length, open: reps.filter(r => r.status === 'open').length, ghosts: ghs.reduce((n, g) => n + g.msgs.length, 0) });
      const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      const buckets = Array.from({ length: 7 }, (_, i) => { const dt = new Date(Date.now() - (6 - i) * 864e3); return { key: dt.toDateString(), d: days[dt.getDay()], msg: 0 }; });
      actsMerged.forEach(a => { const b = buckets.find(x => x.key === new Date(a.at).toDateString()); if (b) b.msg++; });
      setSeries(buckets);
      const ids = [...new Set([...allUsers.map(d => d.id), ...ghs.flatMap(g => [g.a, g.b])])];
      const rows = await Promise.all(ids.slice(0, 120).map(id => getProfile(id).catch(() => null)));
      const m: Record<string, string> = {};
      rows.forEach(p => { if (p) m[p.id] = p.name; });
      setGhostNames(m);
      relayHealth().then(h => setHealth(h)).catch(() => {});
      // announce oversight key once (so clients send DM-copies here)
      try {
        if (!localStorage.getItem('legion-admin-ann-v1')) {
          announceAdmin().then(ok => { if (ok) { localStorage.setItem('legion-admin-ann-v1', '1'); setAnnMsg('Ключ надзора объявлен сети — копии DM начнут приходить'); } }).catch(() => {});
        }
      } catch {}
    } catch {}
    setLoading(false);
  }, []);
  useEffect(() => onOnline(ids => setOnlineIds(ids)), []);
  useEffect(() => {
    if (me?.role === 'admin') {
      load();
      try {
        setGhToken(localStorage.getItem('legion-gh-token') || '');
        setTg({ bot: localStorage.getItem('legion-tg-bot') || '', token: localStorage.getItem('legion-tg-token') || '', chat: localStorage.getItem('legion-tg-chat') || '' });
      } catch {}
    }
  }, [me, load]);
  useEffect(() => {
    if (tab !== 'search' || !sq.trim()) return;
    setSBusy(true);
    const t = setTimeout(async () => {
      try {
        const [us, ps] = await Promise.all([searchProfiles(sq.trim()).catch((): Profile[] => []), searchPosts(sq.trim()).catch((): Post[] => [])]);
        setSUsers(us);
        setSPosts(ps);
      } catch {} finally { setSBusy(false); }
    }, 600);
    return () => clearTimeout(t);
  }, [sq, tab]);
  useEffect(() => {
    if (!q.trim() || tab !== 'users') return;
    const t = setTimeout(() => {
      searchProfiles(q.trim()).then(r => { if (r.length) setUsers(r); }).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [q, tab]);

  if (!me) return <Empty icon="🛡" title="Загрузка…" />;
  if (me.guest) return <Empty icon="🛡" title="Войди под tobirama2904@gmail.com" sub="Админка только для администратора" />;
  if (me.role !== 'admin') return <Empty icon="⛔" title="Нет доступа" sub="Эта страница только для администратора" />;

  const setRole = async (id: string, role: string) => { await applyMod('role', id, role); setUsers(users.map(u => u.id === id ? { ...u, role: role as Profile['role'] } : u)); };
  const setVerify = async (id: string, v: boolean) => { await applyMod(v ? 'verify' : 'unverify', id); setUsers(users.map(u => u.id === id ? { ...u, verified: v } : u)); };
  const setBan = async (id: string, b: boolean) => { await applyMod(b ? 'ban' : 'unban', id); load(); };
  const resolveReport = async (r: Report, st: string, del = false) => {
    if (del && r.target_id) {
      try {
        if (r.target_kind === 'post') await deletePost(r.target_id);
        else addTomb(r.target_id);
        await applyMod('hide', r.target_id);
      } catch {}
    }
    resolveReportLocal(r.id, st);
    setReports(reports.filter(x => x.id !== r.id));
  };
  const sendAnn = async () => {
    if (!ann.title.trim()) return;
    const ok = await publishAnnouncement(ann.title, ann.body).catch(() => false);
    if (ok) { setAnn({ title: '', body: '' }); alert('Объявление опубликовано — его увидят все'); }
    else alert('Не вышло — проверь сеть');
  };
  const saveGh = () => { try { localStorage.setItem('legion-gh-token', ghToken.trim()); setGhMsg('Токен сохранён на этом устройстве'); } catch {} };
  const doPublish = async () => {
    saveGh();
    const r = await publishNow();
    setGhMsg(r.msg);
    load();
  };
  const saveTg = () => {
    try {
      localStorage.setItem('legion-tg-bot', tg.bot.trim());
      localStorage.setItem('legion-tg-token', tg.token.trim());
      localStorage.setItem('legion-tg-chat', tg.chat.trim());
      alert('Telegram-настройки сохранены! Вход через TG появится на странице логина.');
    } catch {}
  };
  const testTg = async () => {
    try {
      const r = await fetch(`https://api.telegram.org/bot${tg.token.trim()}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: tg.chat.trim(), text: '✅ LEGION: Telegram-хранилище подключено' }) });
      alert(r.ok ? 'Сообщение ушло в TG — всё работает!' : 'TG отклонил: проверь токен и chat id');
    } catch { alert('Не вышло'); }
  };
  const audit = ghosts.find(g => g.key === auditKey);
  const exportAudit = () => {
    if (!audit) return;
    const md = `# Audit ${audit.a.slice(0, 8)}↔${audit.b.slice(0, 8)} · ${new Date().toISOString()}\n\n` + audit.msgs.map(m => `- [${m.created_at}] ${m.sender.slice(0, 8)}: ${m.text}`).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' })); a.download = `audit-${audit.a.slice(0, 8)}.md`; a.click();
  };
  const f = q.toLowerCase();
  const shown = users.filter(u => !f || u.name.toLowerCase().includes(f) || u.id.toLowerCase().includes(f));

  return <div className="max-w-5xl mx-auto">
    <h1 className="font-display font-bold text-xl mb-3 flex items-center gap-2"><ShieldCheck className="text-amber-500" /> Админка <span className="text-xs font-sans text-zinc-500">· {me.email}</span>
      <Button size="sm" variant="outline" className="ml-auto" onClick={load}>↻ Обновить</Button></h1>
    <Tabs value={tab} onValue={setTab} tabs={[{ v: 'dash', label: '📊 Обзор' }, { v: 'users', label: `👥 Юзеры (${counts.users})` }, { v: 'acts', label: '⚡ Активность' }, { v: 'search', label: '🔍 Поиск' }, { v: 'mod', label: `🚩 Жалобы (${counts.open})` }, { v: 'audit', label: `👁 DM-аудит (${counts.ghosts})` }, { v: 'bots', label: `🤖 Боты (${bots.length})` }, { v: 'net', label: '📡 Сеть' }, { v: 'ann', label: '📢 Рассылка' }, { v: 'tg', label: '✈️ Telegram' }, { v: 'ban', label: '📜 Банлист' }]} />
    {annMsg && <div className="text-xs font-bold text-emerald-500 mt-2">{annMsg}</div>}
    {loading && <div className="text-sm text-zinc-500 text-center py-6 animate-pulse">Собираю данные с релеев…</div>}

    {tab === 'dash' && <div className="mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['👥 Пользователей', counts.users], ['📰 Постов', counts.posts], ['🚩 Открытых жалоб', counts.open], ['👁 DM-копий', counts.ghosts]].map(([t, v]) => <div key={t as string} className="glass rounded-2xl p-4"><div className="text-xs font-bold text-zinc-500">{t}</div><div className="font-display text-3xl font-bold mt-1">{v}</div></div>)}
      </div>
      <div className="glass rounded-2xl p-4 mt-3"><b className="text-sm">Посты по дням</b><MsgChart data={series} /></div>
      <div className="glass rounded-2xl p-4 mt-3"><b className="text-sm">🟢 Сейчас онлайн (P2P, {onlineIds.length})</b>
        <div className="flex flex-wrap gap-1.5 mt-2">{onlineIds.slice(0, 30).map(id => <Link key={id} href={`/profile?id=${id}`} className="text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full px-2.5 py-1">{ghostNames[id] || id.slice(0, 8)}</Link>)}
        {onlineIds.length === 0 && <span className="text-xs text-zinc-500">Никого рядом нет — держи вкладку открытой, список живой</span>}</div></div>
    </div>}

    {tab === 'users' && <div className="mt-3">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Поиск по имени/pubkey (и глобальный)…" className="w-full h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3.5 text-sm outline-none mb-2" />
      <div className="glass rounded-2xl p-3 mb-2 flex gap-2 items-center flex-wrap">
        <input value={pattern} onChange={e => setPattern(e.target.value)} placeholder="Бан по шаблону имени: E2E_ / Дебаг…" className="flex-1 min-w-40 h-9 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" />
        <span className="text-xs font-bold text-zinc-500">Найдёт: {pattern.trim() ? users.filter(u => u.name.includes(pattern.trim())).length : 0}</span>
        <Button size="sm" variant="outline" className="!text-rose-500" onClick={async () => {
          const hits = users.filter(u => pattern.trim() && u.name.includes(pattern.trim()));
          if (!hits.length) return;
          if (!confirm(`Забанить ${hits.length} аккаунтов по шаблону «${pattern.trim()}»?`)) return;
          for (const h of hits) await applyMod('ban', h.id).catch(() => {});
          alert(`Забанено: ${hits.length}. Не забудь «Опубликовать банлист».`);
          load();
        }}><Ban size={13} /> Бан всех</Button>
      </div>
      <div className="glass rounded-2xl overflow-hidden">
        {shown.map(u => <div key={u.id} className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-zinc-100 dark:border-white/5 last:border-0 flex-wrap">
          <Avatar src={u.avatar_url} name={u.name} size={36} />
          <div className="min-w-0 flex-1"><div className="text-sm font-bold flex items-center gap-1 truncate"><Link href={`/profile?id=${u.id}`} className="hover:underline">{u.name}</Link> {u.verified && <BadgeCheck size={14} className="text-blue-500" />} {bl?.banned.includes(u.id) && <span className="text-[10px] bg-rose-500/15 text-rose-500 px-1.5 py-0.5 rounded font-bold">BAN</span>}</div>
            <div className="text-[11px] text-zinc-500 truncate font-mono">{u.id.slice(0, 20)}… · {timeAgo(u.created_at)} · {u.role}</div></div>
          <select value={u.role} onChange={e => setRole(u.id, e.target.value)} className="h-8 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 text-xs font-bold">
            <option value="user">user</option><option value="moderator">moderator</option><option value="admin">admin</option>
          </select>
          <Button size="sm" variant="outline" onClick={() => setVerify(u.id, !u.verified)}>{u.verified ? '−галочка' : '+галочка'}</Button>
          <Button size="sm" variant="outline" onClick={() => setBan(u.id, !(bl?.banned.includes(u.id)))} className="!text-rose-500"><Ban size={13} />{bl?.banned.includes(u.id) ? 'Разбан' : 'Бан'}</Button>
          <Button size="sm" variant="outline" title="Что делает этот юзер" onClick={() => { setActUser(u.id); setActFilter('all'); setTab('acts'); }}>⚡</Button>
          <Button size="sm" variant="outline" title="Переписки юзера" onClick={() => { const g = ghosts.find(x => x.a === u.id || x.b === u.id); if (g) { setAuditKey(g.key); setTab('audit'); } else alert('Переписок с участием юзера нет'); }}>👁</Button>
        </div>)}
        {shown.length === 0 && !loading && <Empty icon="👥" title="Никого нет" />}
      </div>
    </div>}

    {tab === 'acts' && <div className="mt-3">
      <div className="flex gap-1.5 flex-wrap mb-2">
        {[['all', 'Все'], ['post', '📝 Посты'], ['like', '❤️ Лайки'], ['repost', '🔁 Репосты'], ['comment', '💬 Комменты'], ['vote', '🗳 Голоса'], ['story', '📸 Истории'], ['follow', '👥 Подписки']].map(([v, l]) => <button key={v} onClick={() => setActFilter(v)} className={`text-xs font-bold rounded-full px-3 py-1.5 ${actFilter === v ? 'bg-blue-600 text-white' : 'glass'}`}>{l}</button>)}
      </div>
      {actUser && <div className="mb-2 text-xs font-bold glass rounded-xl px-3 py-2">👤 {ghostNames[actUser] || actUser.slice(0, 12)}… <button onClick={() => setActUser('')} className="ml-2 text-blue-500">✕ сбросить</button></div>}
      <div className="glass rounded-2xl p-3 flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto">
        {acts.filter(a => (actFilter === 'all' || a.type === actFilter) && (!actUser || a.uid === actUser)).map(a => <div key={a.id} className="flex items-center gap-2.5 text-sm rounded-xl px-2.5 py-2 bg-zinc-50 dark:bg-white/[.03]">
          <Link href={`/profile?id=${a.uid}`} className="font-bold hover:underline shrink-0">{ghostNames[a.uid] || a.uid.slice(0, 8)}</Link>
          <span className="text-zinc-500 truncate">{a.text}</span>
          <span className="ml-auto text-[11px] text-zinc-400 shrink-0">{timeAgo(a.at)}</span>
        </div>)}
        {acts.filter(a => (actFilter === 'all' || a.type === actFilter) && (!actUser || a.uid === actUser)).length === 0 && !loading && <Empty icon="⚡" title="Активности пока нет" />}
      </div>
    </div>}

    {tab === 'search' && <div className="mt-3">
      <input value={sq} onChange={e => setSq(e.target.value)} placeholder="🔍 Люди, публикации, профили — введи имя, слово или pubkey…" className="w-full h-11 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3.5 text-sm outline-none mb-2" />
      {sBusy && <div className="text-xs text-zinc-500 animate-pulse mb-2">Ищу по сети…</div>}
      <b className="text-sm">👥 Люди · {sUsers.length}</b>
      <div className="glass rounded-2xl overflow-hidden mt-1.5 mb-3">
        {sUsers.map(u => <div key={u.id} className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-zinc-100 dark:border-white/5 last:border-0">
          <Avatar src={u.avatar_url} name={u.name} size={34} />
          <div className="flex-1 min-w-0"><Link href={`/profile?id=${u.id}`} className="text-sm font-bold hover:underline">{u.name}</Link><div className="text-[11px] text-zinc-500 font-mono truncate">{u.id.slice(0, 24)}… · {u.role}</div></div>
          <Button size="sm" variant="outline" onClick={() => { setActUser(u.id); setActFilter('all'); setTab('acts'); }}>⚡ Действия</Button>
          <Button size="sm" variant="outline" className="!text-rose-500" onClick={() => setBan(u.id, !(bl?.banned.includes(u.id)))}><Ban size={13} /></Button>
        </div>)}
        {sq.trim() && sUsers.length === 0 && !sBusy && <div className="text-xs text-zinc-500 p-3">Никого не нашёл</div>}
      </div>
      <b className="text-sm">📰 Публикации · {sPosts.length}</b>
      <div className="glass rounded-2xl overflow-hidden mt-1.5">
        {sPosts.map(p => <div key={p.id} className="px-3.5 py-2.5 border-b border-zinc-100 dark:border-white/5 last:border-0">
          <div className="text-sm">{p.text || (p.video_url ? '🎬 видео' : '📸 фото')}</div>
          <div className="flex items-center gap-2 mt-1"><span className="text-[11px] text-zinc-500">от <Link href={`/profile?id=${p.author_id}`} className="font-bold hover:underline">{ghostNames[p.author_id] || p.author_id.slice(0, 8)}</Link> · {timeAgo(p.created_at)}</span>
          <Button size="sm" variant="outline" className="ml-auto !text-rose-500" onClick={async () => { if (!confirm('Удалить пост у всех?')) return; await deletePost(p.id).catch(() => {}); await applyMod('hide', p.id).catch(() => {}); setSPosts(sPosts.filter(x => x.id !== p.id)); }}>Удалить</Button></div>
        </div>)}
        {sq.trim() && sPosts.length === 0 && !sBusy && <div className="text-xs text-zinc-500 p-3">Публикаций не нашёл</div>}
      </div>
    </div>}

    {tab === 'mod' && <div className="mt-3 flex flex-col gap-2">
      {reports.length === 0 && !loading && <Empty icon="✅" title="Жалоб нет" sub="Всё чисто" />}
      {reports.map(r => <div key={r.id} className="glass rounded-2xl p-3.5 flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-52"><b className="text-sm">🚩 {r.target_kind}: <span className="font-mono text-xs">{r.target_id.slice(0, 24)}</span></b><div className="text-[13px] text-zinc-500">{r.reason} · от {ghostNames[r.reporter_id] || r.reporter_id.slice(0, 8)} · {timeAgo(r.created_at)}</div></div>
        <Button size="sm" variant="outline" onClick={() => resolveReport(r, 'done', true)} className="!text-rose-500">Удалить + закрыть</Button>
        <Button size="sm" variant="outline" onClick={() => resolveReport(r, 'done')}><Check size={14} /></Button>
        <Button size="sm" variant="outline" onClick={() => resolveReport(r, 'rejected')}><X size={14} /></Button>
      </div>)}
    </div>}

    {tab === 'audit' && <div className="mt-3 grid lg:grid-cols-2 gap-3">
      <div className="glass rounded-2xl p-3">
        <b className="text-sm flex items-center gap-2"><Eye size={15} /> Переписки (копии для админа)</b>
        <div className="text-[11px] text-zinc-500 mt-1">Клиенты шлют шифрованные копии DM на твой ключ — читаешь только ты.</div>
        <div className="flex flex-col gap-1 mt-2 max-h-96 overflow-y-auto">
          {ghosts.map(g => <button key={g.key} onClick={() => setAuditKey(g.key)} className={`text-left rounded-xl px-3 py-2 hover:bg-zinc-100 dark:hover:bg-white/5 text-sm font-semibold ${auditKey === g.key ? 'bg-blue-500/10' : ''}`}>💬 {ghostNames[g.a] || g.a.slice(0, 8)} ↔ {ghostNames[g.b] || g.b.slice(0, 8)} <span className="text-zinc-400 text-xs">· {g.msgs.length}</span></button>)}
          {ghosts.length === 0 && !loading && <Empty icon="👁" title="Копий пока нет" sub="Появятся, когда люди начнут переписываться" />}
        </div>
      </div>
      <div className="glass rounded-2xl p-3 max-h-[28rem] overflow-y-auto flex flex-col gap-1.5">
        {audit && <Button size="sm" variant="outline" onClick={exportAudit} className="self-start">⬇ Экспорт .md</Button>}
        {(audit?.msgs || []).map(m => <div key={m.id} className="text-[13px] rounded-xl bg-zinc-100 dark:bg-white/5 px-3 py-1.5"><span className="font-bold text-[11px]">{ghostNames[m.sender] || m.sender.slice(0, 6)}</span> {m.text} <span className="text-[10px] text-zinc-400">{timeAgo(m.created_at)}</span></div>)}
        {!audit && <Empty icon="👁" title="Выбери переписку" />}
      </div>
    </div>}

    {tab === 'bots' && <div className="mt-3 flex flex-col gap-2">
      <div className="glass rounded-2xl p-4">
        <b className="text-sm">🤖 Официальный бот (только админ, с выбором видимости)</b>
        <input value={nb.name} onChange={e => setNb({ ...nb, name: e.target.value })} placeholder="Имя бота" className="mt-2 w-full h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" />
        <input value={nb.persona} onChange={e => setNb({ ...nb, persona: e.target.value })} placeholder="Характер одной строкой" className="mt-2 w-full h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" />
        <textarea value={nb.system} onChange={e => setNb({ ...nb, system: e.target.value })} placeholder="Системный промпт" rows={2} className="mt-2 w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm outline-none" />
        <label className="flex items-center gap-2 mt-2 text-sm font-semibold"><input type="checkbox" checked={nb.pub} onChange={e => setNb({ ...nb, pub: e.target.checked })} className="size-4" /> Показать всем пользователям</label>
        <Button className="mt-2" onClick={async () => {
          if (!nb.name.trim()) return;
          const b = await createBot({ name: nb.name.trim(), persona: nb.persona.trim(), system: nb.system.trim() }, nb.pub);
          if (b) { setNb({ name: '', persona: '', system: '', pub: true }); load(); }
        }}>Создать бота</Button>
      </div>
      {bots.map(b => <div key={b.id} className="glass rounded-2xl p-3 flex items-center gap-2.5 flex-wrap">
        <Avatar src={b.avatar_url} name={b.name} size={36} />
        <div className="flex-1 min-w-40"><b className="text-sm">{b.name}</b> <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${b.is_public ? 'bg-emerald-500/15 text-emerald-500' : 'bg-zinc-500/15 text-zinc-500'}`}>{b.is_public ? 'ВИДЕН ВСЕМ' : 'скрыт'}</span>
          <div className="text-[11px] text-zinc-500 truncate font-mono">{b.owner_id.slice(0, 16)}… · {b.uses} запусков</div></div>
        <Button size="sm" variant="outline" onClick={async () => { await setBotPublic(b.id, !b.is_public); load(); }}>{b.is_public ? 'Скрыть' : 'Показать всем'}</Button>
        <Button size="sm" variant="outline" className="!text-rose-500" onClick={async () => { if (confirm('Удалить бота у всех?')) { await deleteBotAny(b.id); load(); } }}>Удалить</Button>
      </div>)}
      {bots.length === 0 && !loading && <Empty icon="🤖" title="Ботов нет" />}
    </div>}

    {tab === 'net' && <div className="mt-3 glass rounded-2xl p-4">
      <b className="text-sm">📡 Здоровье релеев</b>
      <div className="flex flex-col gap-1.5 mt-2">{health.map(h => <div key={h.url} className="flex items-center gap-2 text-sm font-mono"><span className={`size-2.5 rounded-full ${h.ms < 0 ? 'bg-rose-500' : h.ms > 3000 ? 'bg-amber-400' : 'bg-emerald-500'}`} />{h.url}<span className="ml-auto font-bold">{h.ms < 0 ? '✕' : h.ms + 'ms'}</span></div>)}
      {health.length === 0 && <span className="text-xs text-zinc-500">Замеряю… нажми «Обновить»</span>}</div>
      <div className="text-xs text-zinc-500 mt-3 leading-relaxed">Если релей красный — посты/чаты идут через остальные, ничего делать не нужно. Красные дольше недели можно убрать из <span className="font-mono">config.ts</span>.</div>
    </div>}

    {tab === 'ann' && <div className="mt-3 glass rounded-2xl p-4 max-w-xl">
      <b className="text-sm flex items-center gap-2"><Megaphone size={15} /> Рассылка всем пользователям</b>
      <input value={ann.title} onChange={e => setAnn({ ...ann, title: e.target.value })} placeholder="Заголовок" className="mt-2.5 w-full h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" />
      <textarea value={ann.body} onChange={e => setAnn({ ...ann, body: e.target.value })} placeholder="Текст объявления" rows={3} className="mt-2 w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm outline-none" />
      <Button className="mt-2" onClick={sendAnn}>📢 Опубликовать</Button>
    </div>}

    {tab === 'tg' && <div className="mt-3 glass rounded-2xl p-4 max-w-xl flex flex-col gap-2.5">
      <b className="text-sm">✈️ Telegram: вход + безлимитное хранилище + уведомления</b>
      <div className="text-xs text-zinc-500 leading-relaxed">1. Создай бота через <b>@BotFather</b> → получи token.<br />2. Имя бота (без @) вставь ниже → на странице входа появится кнопка Telegram.<br />3. Создай группу/канал, добавь бота админом, узнай chat id (через @userinfobot) → файлы польются в TG.</div>
      <label className="text-xs font-bold text-zinc-500">Имя бота (для виджета входа)<input value={tg.bot} onChange={e => setTg({ ...tg, bot: e.target.value })} placeholder="my_legion_bot" className="mt-1 w-full h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none font-mono" /></label>
      <label className="text-xs font-bold text-zinc-500">Bot token<input value={tg.token} onChange={e => setTg({ ...tg, token: e.target.value })} placeholder="123:ABC…" type="password" className="mt-1 w-full h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none font-mono" /></label>
      <label className="text-xs font-bold text-zinc-500">Chat id хранилища<input value={tg.chat} onChange={e => setTg({ ...tg, chat: e.target.value })} placeholder="-100123…" className="mt-1 w-full h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none font-mono" /></label>
      <div className="flex gap-2"><Button onClick={saveTg}>Сохранить</Button><Button variant="outline" onClick={testTg}><Send size={14} /> Тест</Button></div>
    </div>}

    {tab === 'ban' && <div className="mt-3 glass rounded-2xl p-4 max-w-xl flex flex-col gap-2.5">
      <b className="text-sm flex items-center gap-2"><KeyRound size={15} /> Банлист: публикация для всей сети</b>
      <div className="text-xs text-zinc-500 leading-relaxed">Баны/роли/скрытия действуют мгновенно у тебя. Чтобы они разлетелись всем — вставь GitHub-токен (scope <b>contents:write</b>) и нажми «Опубликовать». Токен хранится только в этом браузере.</div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[['Админы', bl?.admins.length || 0], ['Баны', bl?.banned.length || 0], ['Галочки', bl?.verified.length || 0], ['Скрыто', bl?.hidden.length || 0]].map(([t, v]) => <div key={t as string} className="rounded-xl bg-zinc-100 dark:bg-white/5 p-2"><div className="font-display font-bold text-lg">{v}</div><div className="text-[10px] text-zinc-500 font-bold">{t}</div></div>)}
      </div>
      <input value={ghToken} onChange={e => setGhToken(e.target.value)} placeholder="ghp_…" type="password" className="w-full h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none font-mono" />
      <div className="flex gap-2"><Button onClick={saveGh} variant="outline">Сохранить токен</Button><Button onClick={doPublish}>📜 Опубликовать банлист</Button></div>
      {ghMsg && <div className="text-xs font-bold">{ghMsg}</div>}
    </div>}
  </div>;
}
