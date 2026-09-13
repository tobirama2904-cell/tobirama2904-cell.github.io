'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Landing } from '@/components/landing';
import { loadSession } from '@/lib/hybrid/identity';
export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      if (loadSession()) { router.replace('/chat'); return; }
    } catch {}
    setReady(true);
  }, [router]);
  if (!ready) return <div className="min-h-screen grid place-items-center"><div className="size-10 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 animate-pulse" /></div>;
  return <Landing />;
}
