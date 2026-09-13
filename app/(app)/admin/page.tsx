'use client';
import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Users, Activity, Flag, Megaphone, Eye, Check, X, Ban, BadgeCheck } from 'lucide-react';
import { supaBrowser, isCloud } from '@/lib/supabase/client';
import { useStore } from '@/lib/store';
import { Avatar, Button, Empty } from '@/components/ui/primitives';
import { Tabs } from '@/components/ui/overlays';
import { MsgChart } from '@/components/charts';
import { timeAgo } from '@/lib/utils';
import type { Profile, Activity as Act, Report } from '@/lib/supabase/types';

export default function AdminPage() {
  const me = useStore(s => s.me);
  const cloud = isCloud() && me && !me.guest;
  const [tab, setTab] = useState('dash');
  const [users, setUsers] = useState<Profile[]>([]);
  const [acts, setActs] = useState<Act[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [counts, setCounts] = useState({ users: 0, posts: 0, msgs: 0, open: 0 });
  const [q, setQ] = useState('');
  const [ann, setAnn] = useState({ title: '', body: '' });
  const [convos, setConvos] = useState<{ id: string; title: string; kind: string }[]>([]);
  const [audit, setAudit] = useState<{ text: string; sender_id: string; created_at: string }[]>([]);
  const [auditId, setAuditId] = useState('');
  const [series, setSeries] = useState<{ d: string; msg: number }[]>([]);

  const load = useCallback(async () => {
    if (!cloud) return;
    const sb = supaBrowser();
    const [u, a, r, cv] = await Promise.all([
      sb.from('profiles').select('*').order('created_at', { ascending: false }).limit(100),
      sb.from('activity_log').select('*,user:profiles!activity_log_user_id_fkey(*)').order('created_at', { ascending: false }).limit(80),
      sb.from('reports').select('*').eq('status', 'open').order('created_at', { ascending: false }),
      sb.from('conversations').select('id,title,kind').limit(50),
    ]);
    setUsers((u.data || []) as never[]); setActs((a.data || []) as never[]); setReports((r.data || []) as never[]); setConvos((cv.data || []) as never[]);
    const [p, m] = await Promise.all([sb.from('posts').select('id', { count: 'exact', head: true }), sb.from('messages').select('id', { count: 'exact', head: true })]);
    setCounts({ users: u.data?.length || 0, posts: p.count || 0, msgs: m.count || 0, open: r.data?.length || 0 });
    // реальная гистограмма за 7 дней
    const since = new Date(Date.now() - 7 * 864e3).toISOString();
    const [pp, mm] = await Promise.all([
      sb.from('posts').select('created_at').gte('created_at', since).limit(1000),
      sb.from('messages').select('created_at').gte('created_at', since).limit(2000),
    ]);
    const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const buckets = Array.from({ length: 7 }, (_, i) => { const dt = new Date(Date.now() - (6 - i) * 864e3); return { key: dt.toDateString(), d: days[dt.getDay()], msg: 0 }; });
    [...(pp.data || []), ...(mm.data || [])].forEach((r: any) => {
      const k = new Date((r as { created_at: string }).created_at).toDateString();
      const b = buckets.find(x => x.key === k); if (b) b.msg++;
    });
    setSeries(buckets);
  }, [cloud]);
  useEffect(() => { load(); }, [load]);

  if (!me) return <Empty icon="🛡" title="Загрузка…" />;
  if (me.guest || !cloud) return <Empty icon="🛡" title="Админка доступна в облаке" sub="Войди под tobirama2904@gmail.com после настройки Supabase" />;
  if (me.role !== 'admin') return <Empty icon="⛔" title="Нет доступа" sub="Эта страница только для администратора" />;

  const setRole = async (id: string, role: string) => { await supaBrowser().from('profiles').update({ role }).eq('id', id); load(); };
  const setVerify = async (id: string, v: boolean) => { await supaBrowser().from('profiles').update({ verified: v }).eq('id', id); load(); };
  const setBan = async (id: string, b: boolean) => { await supaBrowser().from('profiles').update({ banned: b } as never).eq('id', id); load(); };
  const resolveReport = async (r: Report, st: string, del = false) => {
    if (del && r.target_kind === 'post') await supaBrowser().from('posts').delete().eq('id', r.target_id);
    if (del && r.target_kind === 'message') await supaBrowser().from('messages').delete().eq('id', r.target_id);
    await supaBrowser().from('reports').update({ status: st }).eq('id', r.id); load();
  };
  const sendAnn = async () => {
    if (!ann.title.trim()) return;
    await supaBrowser().from('announcements').insert({ title: ann.title, body: ann.body });
    const { data: all } = await supaBrowser().from('profiles').select('id');
    const rows = (all || []).slice(0, 2000).map((u: any) => ({ user_id: u.id, kind: 'announce', title: '📢 ' + ann.title, body: ann.body.slice(0, 120) }));
    if (rows.length) {
      const { error } = await supaBrowser().from('notifications').insert(rows);
      if (error) { alert('Рассылка не удалась: ' + error.message); return; }
    }
    setAnn({ title: '', body: '' }); alert(`Объявление разослано (${rows.length})`);
  };
  const openAudit = async (id: string) => {
    setAuditId(id);
    const { data } = await supaBrowser().from('messages').select('text,sender_id,created_at').eq('convo_id', id).order('created_at').limit(100);
    setAudit((data || []) as never[]);
  };
  const exportAudit = () => {
    const md = `# Audit ${auditId} · ${new Date().toISOString()}\n\n` + audit.map(m => `- [${m.created_at}] ${m.sender_id}: ${m.text}`).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' })); a.download = `audit-${auditId.slice(0, 8)}.md`; a.click();
  };
  const f = q.toLowerCase();
  const shown = users.filter(u => !f || u.name.toLowerCase().includes(f) || u.email.toLowerCase().includes(f));

  return <div className="max-w-5xl mx-auto">
    <h1 className="font-display font-bold text-xl mb-3 flex items-center gap-2"><ShieldCheck className="text-amber-500" /> Админка <span className="text-xs font-sans text-zinc-500">· {me.email}</span></h1>
    <Tabs value={tab} onValue={setTab} tabs={[{ v: 'dash', label: '📊 Обзор' }, { v: 'users', label: `👥 Юзеры (${counts.users})` }, { v: 'acts', label: '⚡ Активность' }, { v: 'mod', label: `🚩 Жалобы (${counts.open})` }, { v: 'ann', label: '📢 Рассылка' }, { v: 'audit', label: '👁 Аудит чатов' }]} />

    {tab === 'dash' && <div className="mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['👥 Пользователей', counts.users], ['📰 Постов', counts.posts], ['💬 Сообщений', counts.msgs], ['🚩 Открытых жалоб', counts.open]].map(([t, v]) => <div key={t as string} className="glass rounded-2xl p-4"><div className="text-xs font-bold text-zinc-500">{t}</div><div className="font-display text-3xl font-bold mt-1">{v}</div></div>)}
      </div>
      <div className="glass rounded-2xl p-4 mt-3"><b className="text-sm">Активность сети</b><MsgChart data={series} /></div>
    </div>}

    {tab === 'users' && <div className="mt-3">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Поиск по имени/email…" className="w-full h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3.5 text-sm outline-none mb-2" />
      <div className="glass rounded-2xl overflow-hidden">
        {shown.map(u => <div key={u.id} className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-zinc-100 dark:border-white/5 last:border-0 flex-wrap">
          <Avatar src={u.avatar_url} name={u.name} size={36} />
          <div className="min-w-0 flex-1"><div className="text-sm font-bold flex items-center gap-1 truncate">{u.name} {u.verified && <BadgeCheck size={14} className="text-blue-500" />} {(u as { banned?: boolean }).banned && <span className="text-[10px] bg-rose-500/15 text-rose-500 px-1.5 py-0.5 rounded font-bold">BAN</span>}</div>
            <div className="text-[11px] text-zinc-500 truncate">{u.email} · {timeAgo(u.created_at)} · {u.role}</div></div>
          <select value={u.role} onChange={e => setRole(u.id, e.target.value)} className="h-8 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 text-xs font-bold">
            <option value="user">user</option><option value="moderator">moderator</option><option value="admin">admin</option>
          </select>
          <Button size="sm" variant="outline" onClick={() => setVerify(u.id, !u.verified)}>{u.verified ? '−галочка' : '+галочка'}</Button>
          <Button size="sm" variant="outline" onClick={() => setBan(u.id, !(u as { banned?: boolean }).banned)} className="!text-rose-500"><Ban size={13} />{(u as { banned?: boolean }).banned ? 'Разбан' : 'Бан'}</Button>
        </div>)}
      </div>
    </div>}

    {tab === 'acts' && <div className="mt-3 glass rounded-2xl p-3 flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto">
      {acts.map(a => <div key={a.id} className="flex items-center gap-2.5 text-sm rounded-xl px-2.5 py-2 bg-zinc-50 dark:bg-white/[.03]">
        <Avatar src={a.user?.avatar_url} name={a.user?.name || '?'} size={28} />
        <span><b>{a.user?.name || '?'}</b> <span className="text-zinc-500">{a.kind}: {a.detail}</span></span>
        <span className="ml-auto text-[11px] text-zinc-400 shrink-0">{timeAgo(a.created_at)}</span>
      </div>)}
      {acts.length === 0 && <Empty icon="⚡" title="Активности пока нет" />}
    </div>}

    {tab === 'mod' && <div className="mt-3 flex flex-col gap-2">
      {reports.length === 0 && <Empty icon="✅" title="Жалоб нет" sub="Всё чисто" />}
      {reports.map(r => <div key={r.id} className="glass rounded-2xl p-3.5 flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-52"><b className="text-sm">🚩 {r.target_kind}: <span className="font-mono text-xs">{r.target_id}</span></b><div className="text-[13px] text-zinc-500">{r.reason} · {timeAgo(r.created_at)}</div></div>
        <Button size="sm" variant="outline" onClick={() => resolveReport(r, 'done', true)} className="!text-rose-500">Удалить + закрыть</Button>
        <Button size="sm" variant="outline" onClick={() => resolveReport(r, 'done')}><Check size={14} /></Button>
        <Button size="sm" variant="outline" onClick={() => resolveReport(r, 'rejected')}><X size={14} /></Button>
      </div>)}
    </div>}

    {tab === 'ann' && <div className="mt-3 glass rounded-2xl p-4 max-w-xl">
      <b className="text-sm flex items-center gap-2"><Megaphone size={15} /> Рассылка всем пользователям</b>
      <input value={ann.title} onChange={e => setAnn({ ...ann, title: e.target.value })} placeholder="Заголовок" className="mt-2.5 w-full h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm outline-none" />
      <textarea value={ann.body} onChange={e => setAnn({ ...ann, body: e.target.value })} placeholder="Текст объявления" rows={3} className="mt-2 w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm outline-none" />
      <Button className="mt-2" onClick={sendAnn}>📢 Разослать</Button>
    </div>}

    {tab === 'audit' && <div className="mt-3 grid lg:grid-cols-2 gap-3">
      <div className="glass rounded-2xl p-3">
        <b className="text-sm flex items-center gap-2"><Eye size={15} /> Чаты (инкогнито)</b>
        <div className="flex flex-col gap-1 mt-2 max-h-96 overflow-y-auto">
          {convos.map(c => <button key={c.id} onClick={() => openAudit(c.id)} className="text-left rounded-xl px-3 py-2 hover:bg-zinc-100 dark:hover:bg-white/5 text-sm font-semibold">💬 {c.title || c.id.slice(0, 8)} <span className="text-zinc-400 text-xs">· {c.kind}</span></button>)}
        </div>
      </div>
      <div className="glass rounded-2xl p-3 max-h-[28rem] overflow-y-auto flex flex-col gap-1.5">
        {audit.length > 0 && <Button size="sm" variant="outline" onClick={exportAudit} className="self-start">⬇ Экспорт .md</Button>}
        {audit.map((m, i) => <div key={i} className="text-[13px] rounded-xl bg-zinc-100 dark:bg-white/5 px-3 py-1.5"><span className="font-mono text-[10px] text-zinc-400">{m.sender_id.slice(0, 6)}</span> {m.text} <span className="text-[10px] text-zinc-400">{timeAgo(m.created_at)}</span></div>)}
        {audit.length === 0 && <Empty icon="👁" title="Выбери чат" />}
      </div>
    </div>}
  </div>;
}
