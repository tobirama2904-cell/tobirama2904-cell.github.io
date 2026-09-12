'use client';
import * as React from 'react';
import * as DialogPr from '@radix-ui/react-dialog';
import * as DropPr from '@radix-ui/react-dropdown-menu';
import * as PopPr from '@radix-ui/react-popover';
import * as TipPr from '@radix-ui/react-tooltip';
import * as TabsPr from '@radix-ui/react-tabs';
import * as SelectPr from '@radix-ui/react-select';
import * as ScrollPr from '@radix-ui/react-scroll-area';
import { X, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Dialog({ open, onOpenChange, title, children, wide }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; children: React.ReactNode; wide?: boolean }) {
  return <DialogPr.Root open={open} onOpenChange={onOpenChange}>
    <DialogPr.Portal>
      <DialogPr.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
      <DialogPr.Content className={cn('fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-2xl glass shadow-2xl p-0 w-[calc(100vw-2rem)] animate-[msgIn_.3s_cubic-bezier(.34,1.56,.64,1)]', wide ? 'max-w-3xl' : 'max-w-md')}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-white/10">
          <DialogPr.Title className="font-display font-bold text-sm tracking-wide">{title}</DialogPr.Title>
          <DialogPr.Close className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10"><X size={16} /></DialogPr.Close>
        </div>
        <div className="p-5 max-h-[75vh] overflow-y-auto">{children}</div>
      </DialogPr.Content>
    </DialogPr.Portal>
  </DialogPr.Root>;
}
export function Menu({ trigger, items }: { trigger: React.ReactNode; items: { label: React.ReactNode; onClick?: () => void; danger?: boolean }[] }) {
  return <DropPr.Root>
    <DropPr.Trigger asChild>{trigger}</DropPr.Trigger>
    <DropPr.Portal>
      <DropPr.Content className="z-50 min-w-44 rounded-xl glass shadow-xl p-1.5 animate-[msgIn_.2s]" sideOffset={6}>
        {items.map((it, i) => <DropPr.Item key={i} onClick={it.onClick} className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium cursor-pointer outline-none hover:bg-zinc-100 dark:hover:bg-white/10', it.danger && 'text-rose-500')}>{it.label}</DropPr.Item>)}
      </DropPr.Content>
    </DropPr.Portal>
  </DropPr.Root>;
}
export function Pop({ trigger, children, wide }: { trigger: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return <PopPr.Root>
    <PopPr.Trigger asChild>{trigger}</PopPr.Trigger>
    <PopPr.Portal>
      <PopPr.Content className={cn('z-50 rounded-xl glass shadow-xl p-3 animate-[msgIn_.2s]', wide ? 'w-80' : 'w-64')} sideOffset={8}>{children}</PopPr.Content>
    </PopPr.Portal>
  </PopPr.Root>;
}
export function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return <TipPr.Provider delayDuration={300}><TipPr.Root>
    <TipPr.Trigger asChild>{children}</TipPr.Trigger>
    <TipPr.Portal><TipPr.Content className="z-[60] rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-2.5 py-1.5 text-xs font-semibold shadow-xl" sideOffset={6}>{label}</TipPr.Content></TipPr.Portal>
  </TipPr.Root></TipPr.Provider>;
}
export function Tabs({ tabs, value, onValue }: { tabs: { v: string; label: React.ReactNode }[]; value: string; onValue: (v: string) => void }) {
  return <TabsPr.Root value={value} onValueChange={onValue}>
    <TabsPr.List className="inline-flex gap-1 rounded-xl bg-zinc-100 dark:bg-white/5 p-1">
      {tabs.map(t => <TabsPr.Trigger key={t.v} value={t.v} className="rounded-lg px-3.5 py-1.5 text-sm font-semibold text-zinc-500 data-[state=active]:bg-white dark:data-[state=active]:bg-white/10 data-[state=active]:text-zinc-900 dark:data-[state=active]:text-white data-[state=active]:shadow transition">{t.label}</TabsPr.Trigger>)}
    </TabsPr.List>
  </TabsPr.Root>;
}
export function Select({ value, onValue, options, className }: { value: string; onValue: (v: string) => void; options: { v: string; label: string }[]; className?: string }) {
  return <SelectPr.Root value={value} onValueChange={onValue}>
    <SelectPr.Trigger className={cn('inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 dark:border-white/10 bg-white/70 dark:bg-white/5 px-3.5 text-sm font-semibold outline-none focus:border-blue-500', className)}>
      <SelectPr.Value /><SelectPr.Icon><ChevronDown size={14} /></SelectPr.Icon>
    </SelectPr.Trigger>
    <SelectPr.Portal>
      <SelectPr.Content className="z-50 rounded-xl glass shadow-xl p-1.5 min-w-40">
        {options.map(o => <SelectPr.Item key={o.v} value={o.v} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium cursor-pointer outline-none hover:bg-zinc-100 dark:bg-white/10 data-[state=checked]:text-blue-600">
          <SelectPr.ItemText>{o.label}</SelectPr.ItemText><SelectPr.ItemIndicator className="ml-auto"><Check size={14} /></SelectPr.ItemIndicator>
        </SelectPr.Item>)}
      </SelectPr.Content>
    </SelectPr.Portal>
  </SelectPr.Root>;
}
export function ScrollArea({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ScrollPr.Root className={cn('overflow-hidden', className)}>
    <ScrollPr.Viewport className="h-full w-full">{children}</ScrollPr.Viewport>
    <ScrollPr.Scrollbar orientation="vertical" className="w-2 p-0.5"><ScrollPr.Thumb className="rounded-full bg-zinc-300 dark:bg-white/20" /></ScrollPr.Scrollbar>
  </ScrollPr.Root>;
}
