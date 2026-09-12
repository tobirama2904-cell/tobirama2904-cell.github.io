import { tool } from 'ai';
import { z } from 'zod';

async function jfetch(url: string, ms = 12000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'LEGION/19' } }); return await r.json(); }
  finally { clearTimeout(t); }
}
export const legionTools = {
  get_time: tool({
    description: 'Текущее время в Душанбе',
    inputSchema: z.object({}),
    execute: async () => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Dushanbe', dateStyle: 'full', timeStyle: 'medium' }).format(new Date()),
  }),
  get_weather: tool({
    description: 'Погода в городе (по умолчанию Душанбе)',
    inputSchema: z.object({ city: z.string().default('Душанбе') }),
    execute: async ({ city }) => {
      try {
        const g = await jfetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ru`);
        const loc = g.results?.[0]; if (!loc) return 'Город не найден';
        const w = await jfetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10kmh,weather_code&timezone=auto`);
        const c = w.current;
        return `${loc.name}: ${c.temperature_2m}°C, влажность ${c.relative_humidity_2m}%, ветер ${c.wind_speed_10kmh} км/ч`;
      } catch { return 'Погода недоступна'; }
    },
  }),
  get_rates: tool({
    description: 'Курсы валют USD/EUR/RUB к TJS',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const j = await jfetch('https://open.er-api.com/v6/latest/USD');
        const r = j.rates, f = (n: number) => n.toFixed(2);
        return `1 USD = ${f(r.TJS)} TJS = ${f(r.RUB)} RUB = ${f(r.EUR)} EUR`;
      } catch { return 'Курсы недоступны'; }
    },
  }),
  get_news: tool({
    description: 'Свежие tech-новости',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const j = await jfetch('https://hn.algolia.com/api/v1/search?tags=front_page');
        return j.hits.slice(0, 6).map((h: { title: string }) => '• ' + h.title).join('\n');
      } catch { return 'Новости недоступны'; }
    },
  }),
};
