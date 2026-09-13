import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'LEGION — AI-соцсеть',
  description: 'Мессенджер, соцсеть и личный ИИ-агент с голосовым управлением. Бесплатно навсегда.',
  manifest: '/manifest.json',
  themeColor: '#0b5fff',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ru" className="dark" suppressHydrationWarning>
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Unbounded:wght@500;600;700;800&display=swap" rel="stylesheet" />
      {process.env.NEXT_PUBLIC_CF_BEACON ? <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon={JSON.stringify({ token: process.env.NEXT_PUBLIC_CF_BEACON })} /> : null}
    </head>
    <body className="noise"><Providers>{children}</Providers></body>
  </html>;
}
