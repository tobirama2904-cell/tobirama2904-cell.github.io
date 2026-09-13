'use client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import ReactECharts from 'echarts-for-react';


export function MsgChart({ data }: { data: { d: string; msg: number }[] }) {
  return <ResponsiveContainer width="100%" height={220}>
    <AreaChart data={data}><defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0b5fff" stopOpacity={0.5} /><stop offset="1" stopColor="#0b5fff" stopOpacity={0} /></linearGradient></defs>
      <XAxis dataKey="d" fontSize={11} tickLine={false} axisLine={false} /><YAxis fontSize={11} tickLine={false} axisLine={false} width={28} />
      <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} /><Area type="monotone" dataKey="msg" stroke="#0b5fff" strokeWidth={2.5} fill="url(#g1)" /></AreaChart>
  </ResponsiveContainer>;
}
export function PostsBars({ data }: { data: { d: string; posts: number }[] }) {
  return <ResponsiveContainer width="100%" height={220}>
    <BarChart data={data}><XAxis dataKey="d" fontSize={11} tickLine={false} axisLine={false} /><YAxis fontSize={11} tickLine={false} axisLine={false} width={28} />
      <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} cursor={{ fill: 'rgba(11,95,255,.08)' }} /><Bar dataKey="posts" fill="#ff6b35" radius={[6, 6, 0, 0]} /></BarChart>
  </ResponsiveContainer>;
}
const COLORS = ['#0b5fff', '#ff6b35', '#10b981', '#8b5cf6'];
export function MixPie({ data }: { data: { n: string; v: number }[] }) {
  const rows = data.filter(d => d.v > 0);
  if (!rows.length) return <div className="h-[220px] grid place-items-center text-sm text-zinc-500">Пока пусто — пользуйся, и тут будет твой микс</div>;
  return <ResponsiveContainer width="100%" height={220}>
    <PieChart><Pie data={rows} dataKey="v" nameKey="n" innerRadius={55} outerRadius={85} paddingAngle={3} strokeWidth={0}>
      {rows.map((_, i) => <Cell key={i} fill={COLORS[i % 4]} />)}
    </Pie><Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} /></PieChart>
  </ResponsiveContainer>;
}
export function VoiceGauge({ value }: { value: number }) {
  return <ReactECharts style={{ height: 220 }} option={{
    series: [{ type: 'gauge', progress: { show: true, width: 10 }, axisLine: { lineStyle: { width: 10 } }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, pointer: { show: false }, anchor: { show: false }, detail: { valueAnimation: true, fontSize: 34, fontWeight: 'bold', formatter: '{value}%', color: '#0b5fff' }, data: [{ value }] }],
  }} />;
}
