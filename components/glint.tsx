'use client';
// GlintKit — фирменная библиотека микро-анимаций LEGION: магнит, блик, бегушка, счётчики.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring, animate } from 'framer-motion';

export function Magnetic({ children, strength = 18 }: { children: ReactNode; strength?: number }) {
  const x = useMotionValue(0), y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 20 }), sy = useSpring(y, { stiffness: 300, damping: 20 });
  return <motion.div style={{ x: sx, y: sy }} onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left - r.width / 2) / r.width * strength * 2); y.set((e.clientY - r.top - r.height / 2) / r.height * strength * 2); }} onMouseLeave={() => { x.set(0); y.set(0); }} className="inline-block">{children}</motion.div>;
}
export function Shine({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`relative overflow-hidden group/shine ${className}`}>
    {children}
    <span className="pointer-events-none absolute top-0 -left-3/4 w-1/2 h-full bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-[-20deg] transition-all duration-700 group-hover/shine:left-[130%]" />
  </div>;
}
export function Marquee({ items }: { items: string[] }) {
  const row = [...items, ...items, ...items];
  return <div className="overflow-hidden whitespace-nowrap py-2">
    <motion.div className="inline-flex gap-8 font-display font-bold text-sm text-zinc-400" animate={{ x: ['0%', '-33.3%'] }} transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}>
      {row.map((t, i) => <span key={i}>{t}</span>)}
    </motion.div>
  </div>;
}
export function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const [v, setV] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { const c = animate(0, to, { duration: 1.6, ease: [0.22, 0.9, 0.3, 1], onUpdate: x => setV(Math.round(x)) }); io.disconnect(); return () => c.stop(); } });
    io.observe(el); return () => io.disconnect();
  }, [to]);
  return <span ref={ref}>{v.toLocaleString('ru-RU')}{suffix}</span>;
}
export function Tilt({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return <div ref={ref} className={className} onMouseMove={e => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.transform = `perspective(800px) rotateY(${((e.clientX - r.left) / r.width - 0.5) * 10}deg) rotateX(${((e.clientY - r.top) / r.height - 0.5) * -10}deg) translateY(-3px)`;
  }} onMouseLeave={() => { if (ref.current) ref.current.style.transform = ''; }} style={{ transition: 'transform .25s ease' }}>{children}</div>;
}
