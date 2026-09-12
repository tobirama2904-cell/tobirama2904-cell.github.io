import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2));
export function timeAgo(ts: string | number | Date) {
  const d = new Date(ts).getTime(), s = Math.max(1, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return `${s}с`;
  const m = Math.floor(s / 60); if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} ч`;
  const dd = Math.floor(h / 24); if (dd < 30) return `${dd} д`;
  return new Date(d).toLocaleDateString('ru-RU');
}
export function fmtTime(ts: string | number | Date) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';
}
export function hue(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
