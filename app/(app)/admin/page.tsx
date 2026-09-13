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
  directory, searchProfiles, getProfile, getPosts, deletePost, getReports,
  resolveReportLocal, publishAnnouncement,
} from '@/lib/hybrid/social';
import { readGhostDMs } from '@/lib/hybrid/dm';
import { loadBanlist, applyMod, publishNow } from '@/lib/hybrid/banlist';
import { addTomb } from '@/lib/hybrid/social';
import type { Profile, Report } from '@/lib/supabase/types';

type GhostGroup = { key: string; a: string; b: string; msgs: { id: string; sender: string; peer: string; kind: string; text: string; media: string | null; created_at: string }[] };

export default function AdminPage() {
  const me = useStore(s => s.me);
  const [tab, setTab] = useState('dash');
  const [users, setUsers] = useState<Profile[]>([]);
  const [acts, setActs] = useState<{ id: string; uid: string; text: string; at: string }[]>([]);
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dirs, reps, ghs, blist] = await Promise.all([
        directory(80).catch(() => []),
        getReports().catch(() => []),
        readGhostDMs().catch(() => []),
        loadBanlist().catch(() => null),
      ]);
      const ps = await getPosts({ limit: 60 }).catch(() => []);
      setUsers(dirs);
      setReports(reps.filter(r => r.status === 'open'));
      setGhosts(ghs);
      if (blist) setBl({ admins: blist.admins, banned: blist.banned, verified: blist.verified, hidden: blist.hidden || [] });
      setActs(ps.map(p => ({ id: p.id, uid: p.author_id, text: '📝 пост: ' + p.text.slice(0, 90), at: p.created_at })));
      setCounts({ users: dirs.length, posts: ps.length, open: reps.filter(r => r.status === 'open').length, ghosts: ghs.reduce((n, g) => n + g.msgs.length, 0) });
      const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      const buckets = Array.from({ length: 7 }, (_, i) => { const dt = new Date(Date.now() - (6 - i) * 864e3); return { key: dt.toDateString(), d: days[dt.getDay()], msg: 0 }; });
      ps.forEach(p => { const b = buckets.find(x => x.key === new Date(p.created_at).toDateString()); if (b) b.msg++; });
      setSeries(buckets);
      const ids = [...new Set([...dirs.map(d => d.id), ...ghs.flatMap(g => [g.a, g.b])])];
      const rows = await Promise.all(ids.slice(0, 100).map(id => getProfile(id).catch(() => null)));
      const m: Record<string, string> = {};
      rows.forEach(p => { if (p) m[p.id] = p.name; });
      setGhostNames(m);
    } catch {}
    setLoading(false);
  }, []);
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
    <Tabs value={tab} onValue={setTab} tabs={[{ v: 'dash', label: '📊 Обзор' }, { v: 'users', label: `👥 Юзеры (${counts.users})` }, { v: 'acts', label: '⚡ Активность' }, { v: 'mod', label: `🚩 Жалобы (${counts.open})` }, { v: 'audit', label: `👁 DM-аудит (${counts.ghosts})` }, { v: 'ann', label: '📢 Рассылка' }, { v: 'tg', label: '✈️ Telegram' }, { v: 'ban', label: '📜 Банлист' }]} />
    {loading && <div className="text-sm text-zinc-500 text-center py-6 animate-pulse">Собираю данные с релеев…</div>}

    {tab === 'dash' && <div className="mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['👥 Пользователей', counts.users], ['📰 Постов', counts.posts], ['🚩 Открытых жалоб', counts.open], ['👁 DM-копий', counts.ghosts]].map(([t, v]) => <div key={t as string} className="glass rounded-2xl p-4"><div className="text-xs font-bold text-zinc-500">{t}</div><div className="font-display text-3xl font-bold mt-1">{v}</div></div>)}
      </div>
      <div className="glass rounded-2xl p-4 mt-3"><b className="text-sm">Посты по дням</b><MsgChart data={series} /></div>
    </div>}

    {tab === 'users' && <div className="mt-3">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Поиск по имени/pubkey (и глобальный)…" className="w-full h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3.5 text-sm outline-none mb-2" />
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
        </div>)}
        {shown.length === 0 && !loading && <Empty icon="👥" title="Никого нет" />}
      </div>
    </div>}

    {tab === 'acts' && <div className="mt-3 glass rounded-2xl p-3 flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto">
      {acts.map(a => <div key={a.id} className="flex items-center gap-2.5 text-sm rounded-xl px-2.5 py-2 bg-zinc-50 dark:bg-white/[.03]">
        <b>{ghostNames[a.uid] || a.uid.slice(0, 8)}</b>
        <span className="text-zinc-500 truncate">{a.text}</span>
        <span className="ml-auto text-[11px] text-zinc-400 shrink-0">{timeAgo(a.at)}</span>
      </div>)}
      {acts.length === 0 && !loading && <Empty icon="⚡" title="Активности пока нет" />}
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
