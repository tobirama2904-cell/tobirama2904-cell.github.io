'use client';
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import * as SwitchPr from '@radix-ui/react-switch';
import * as SliderPr from '@radix-ui/react-slider';
import * as SeparatorPr from '@radix-ui/react-separator';
import * as AvatarPr from '@radix-ui/react-avatar';
import { cn, initials, hue } from '@/lib/utils';

const btn = cva('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0', {
  variants: {
    variant: {
      default: 'bg-blue-600 text-white shadow-lg shadow-blue-600/25 hover:bg-blue-500 hover:-translate-y-px',
      ember: 'bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-lg shadow-orange-500/25 hover:-translate-y-px',
      ghost: 'hover:bg-zinc-100 dark:hover:bg-white/10',
      outline: 'border border-zinc-200 dark:border-white/10 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 bg-white/60 dark:bg-white/5',
      dark: 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:opacity-90',
    },
    size: { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4', lg: 'h-12 px-6 text-base', icon: 'size-10' },
  },
  defaultVariants: { variant: 'default', size: 'md' },
});
export function Button({ className, variant, size, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof btn>) {
  return <button className={cn(btn({ variant, size }), className)} {...p} />;
}
export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cn('h-10 w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white/70 dark:bg-white/5 px-3.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 transition placeholder:text-zinc-400', p.className)} />;
}
export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cn('w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white/70 dark:bg-white/5 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 transition placeholder:text-zinc-400 resize-y', p.className)} />;
}
export function Badge({ className, ...p }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span {...p} className={cn('inline-flex items-center gap-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2.5 py-0.5 text-[11px] font-bold', className)} />;
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-zinc-200 dark:bg-white/10', className)} />;
}
export function Switch(p: React.ComponentProps<typeof SwitchPr.Root>) {
  return <SwitchPr.Root {...p} className={cn('w-10 h-6 rounded-full bg-zinc-300 dark:bg-white/15 data-[state=checked]:bg-blue-600 transition relative', p.className)}>
    <SwitchPr.Thumb className="block size-5 rounded-full bg-white shadow translate-x-0.5 data-[state=checked]:translate-x-[18px] transition-transform" />
  </SwitchPr.Root>;
}
export function Slider(p: React.ComponentProps<typeof SliderPr.Root>) {
  return <SliderPr.Root {...p} className={cn('relative flex w-full items-center h-6', p.className)}>
    <SliderPr.Track className="h-1.5 flex-1 rounded-full bg-zinc-200 dark:bg-white/10"><SliderPr.Range className="absolute h-full rounded-full bg-blue-600" /></SliderPr.Track>
    <SliderPr.Thumb className="block size-4 rounded-full bg-white border-2 border-blue-600 shadow cursor-grab" />
  </SliderPr.Root>;
}
export function Separator(p: React.ComponentProps<typeof SeparatorPr.Root>) {
  return <SeparatorPr.Root {...p} className={cn('bg-zinc-200 dark:bg-white/10 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:h-full', p.className)} />;
}
export function Avatar({ src, name, size = 40 }: { src?: string | null; name: string; size?: number }) {
  return <AvatarPr.Root className="shrink-0 rounded-full overflow-hidden inline-flex" style={{ width: size, height: size }}>
    {src && <AvatarPr.Image src={src} alt={name} className="w-full h-full object-cover" />}
    <AvatarPr.Fallback className="w-full h-full flex items-center justify-center text-white font-bold" style={{ background: `linear-gradient(135deg, hsl(${hue(name)} 70% 50%), hsl(${(hue(name) + 40) % 360} 70% 40%))`, fontSize: size * 0.36 }}>
      {initials(name)}
    </AvatarPr.Fallback>
  </AvatarPr.Root>;
}
export function Empty({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
    <div className="text-4xl">{icon}</div>
    <div className="font-bold">{title}</div>
    {sub && <div className="text-sm text-zinc-500 max-w-xs">{sub}</div>}
  </div>;
}
