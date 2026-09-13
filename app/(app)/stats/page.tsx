'use client';
import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { MsgChart, PostsBars, MixPie, VoiceGauge } from '@/components/charts';
import { Counter } from '@/components/glint';
import { Empty } from '@/components/ui/primitives';
import { getPosts, directory, getStories } from '@/lib/hybrid/social';
import { listConvos } from '@/lib/hybrid/dm';
import { onOnline } from '@/lib/hybrid/live';

export default function StatsPage() {
  const me = useStore(s => s.me);
  const logged = me && !me.guest;
  const [counts, setCounts] = useState({ posts: 0, chats: 0, people: 0, stories: 0, online: 0 });
  const [series, setSeries] = useState<{ d: string; msg: number; posts: number; voice: number }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const off = onOnline(ids => setCounts(c => ({ ...c, online: ids.length })));
    if (!logged) { setLoading(false); return off; }
    (async () => {
      try {
        const [ps, ds, ss] = await Promise.all([
          getPosts({ limit: 100 }).catch(() => []),
          directory(80).catch(() => []),
          getStories().catch(() => []),
        ]);
        const chats = listConvos().length;
        setCounts(c => ({ ...c, posts: ps.length, people: ds.length, stories: ss.length, chats }));
        const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
        const buckets = Array.from({ length: 7 }, (_, i) => { const dt = new Date(Date.now() - (6 - i) * 864e3); return { key: dt.toDateString(), d: days[dt.getDay()], msg: 0, posts: 0, voice: 0 }; });
        ps.forEach(p => {
          const b = buckets.find(x => x.key === new Date(p.created_at).toDateString());
          if (b) b.posts++;
        });
        listConvos().forEach(c => {
          if (!c.last_at) return;
          const b = buckets.find(x => x.key === new Date(c.last_at!).toDateString());
          if (b) b.msg++;
        });
        setSeries(buckets);
      } catch {}
      setLoading(false);
    })();
    return off;
  }, [logged]);
  if (!me) return <Empty icon="…" title="Загрузка…" />;
  if (!logged) return <div className="max-w-4xl mx-auto"><h1 className="font-display font-bold text-xl mb-3">Статистика</h1><Empty icon="📊" title="Войди, чтобы видеть статистику сети" /></div>;
  const activeDays = series.filter(x => x.msg + x.posts > 0).length;
  const cards = [['📰 Постов', counts.posts], ['💬 Моих чатов', counts.chats], ['👥 Людей', counts.people], ['🟢 Онлайн', counts.online]] as const;
  return <div className="max-w-4xl mx-auto">
    <h1 className="font-display font-bold text-xl mb-3">Статистика {loading && <span className="text-xs text-zinc-500 font-sans animate-pulse">· считаю…</span>}</h1>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(([t, v]) => <div key={t} className="glass rounded-2xl p-4 card-hover"><div className="text-xs font-bold text-zinc-500">{t}</div><div className="font-display text-3xl font-bold mt-1"><Counter to={v} /></div></div>)}
    </div>
    <div className="grid lg:grid-cols-2 gap-3 mt-3">
      <div className="glass rounded-2xl p-4"><b className="text-sm">Чаты по дням</b><MsgChart data={series} /></div>
      <div className="glass rounded-2xl p-4"><b className="text-sm">Посты по дням</b><PostsBars data={series} /></div>
      <div className="glass rounded-2xl p-4"><b className="text-sm">Микс активности</b><MixPie data={[{ n: 'Посты', v: counts.posts }, { n: 'Чаты', v: counts.chats }, { n: 'Люди', v: counts.people }, { n: 'Истории', v: counts.stories }]} /></div>
      <div className="glass rounded-2xl p-4"><b className="text-sm">Активных дней из 7</b><VoiceGauge value={Math.round(activeDays / 7 * 100)} /></div>
    </div>
  </div>;
}
