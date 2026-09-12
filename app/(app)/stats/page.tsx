'use client';
import { useEffect, useState } from 'react';
import { supaBrowser, isCloud } from '@/lib/supabase/client';
import { useStore } from '@/lib/store';
import { MsgChart, PostsBars, MixPie, VoiceGauge, useDemoSeries } from '@/components/charts';
import { Counter } from '@/components/glint';

export default function StatsPage() {
  const me = useStore(s => s.me);
  const cloud = isCloud() && me && !me.guest;
  const [counts, setCounts] = useState({ posts: 0, msgs: 0, people: 0, stories: 0 });
  const [series, setSeries] = useState<{ d: string; msg: number; posts: number; voice: number }[]>([]);
  const demo = useDemoSeries();
  useEffect(() => {
    if (!cloud) { setCounts({ posts: 3, msgs: 12, people: 1, stories: 0 }); setSeries(demo); return; }
    (async () => {
      const sb = supaBrowser();
      const [p, m, u, s] = await Promise.all([
        sb.from('posts').select('id', { count: 'exact', head: true }),
        sb.from('messages').select('id', { count: 'exact', head: true }),
        sb.from('profiles').select('id', { count: 'exact', head: true }),
        sb.from('stories').select('id', { count: 'exact', head: true }),
      ]);
      setCounts({ posts: p.count || 0, msgs: m.count || 0, people: u.count || 0, stories: s.count || 0 });
      const since = new Date(Date.now() - 7 * 864e3).toISOString();
      const [pp, mm] = await Promise.all([
        sb.from('posts').select('created_at').gte('created_at', since).limit(1000),
        sb.from('messages').select('created_at').gte('created_at', since).limit(2000),
      ]);
      const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      const buckets = Array.from({ length: 7 }, (_, i) => { const dt = new Date(Date.now() - (6 - i) * 864e3); return { key: dt.toDateString(), d: days[dt.getDay()], msg: 0, posts: 0, voice: 0 }; });
      const bump = (rows: never[], k: 'msg' | 'posts') => rows.forEach(r => {
        const b = buckets.find(x => x.key === new Date((r as { created_at: string }).created_at).toDateString());
        if (b) b[k]++;
      });
      bump((pp.data || []) as never[], 'posts'); bump((mm.data || []) as never[], 'msg');
      setSeries(buckets);
    })();
  }, [cloud, demo]);
  const activeDays = series.filter(x => x.msg + x.posts > 0).length;
  const cards = [['📰 Постов', counts.posts], ['💬 Сообщений', counts.msgs], ['👥 Людей', counts.people], ['📸 Stories', counts.stories]] as const;
  return <div className="max-w-4xl mx-auto">
    <h1 className="font-display font-bold text-xl mb-3">Статистика {!cloud && <span className="text-xs text-zinc-500 font-sans">· демо-данные</span>}</h1>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(([t, v]) => <div key={t} className="glass rounded-2xl p-4 card-hover"><div className="text-xs font-bold text-zinc-500">{t}</div><div className="font-display text-3xl font-bold mt-1"><Counter to={v} /></div></div>)}
    </div>
    <div className="grid lg:grid-cols-2 gap-3 mt-3">
      <div className="glass rounded-2xl p-4"><b className="text-sm">Сообщения по дням</b><MsgChart data={series} /></div>
      <div className="glass rounded-2xl p-4"><b className="text-sm">Посты по дням</b><PostsBars data={series} /></div>
      <div className="glass rounded-2xl p-4"><b className="text-sm">Микс активности</b><MixPie /></div>
      <div className="glass rounded-2xl p-4"><b className="text-sm">{cloud ? 'Активных дней из 7' : 'Голосовая активность (демо)'}</b><VoiceGauge value={cloud ? Math.round(activeDays / 7 * 100) : 62} /></div>
    </div>
  </div>;
}
