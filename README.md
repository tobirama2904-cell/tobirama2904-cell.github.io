# LEGION v19 — AI-соцсеть

Мессенджер + соцсеть + личный ИИ-агент с голосовым управлением. Next.js 19, всё бесплатно.

## Стек
Next.js 15 · React 19 · TypeScript · Tailwind v4 · Radix/shadcn · Framer Motion · GSAP · Lottie · AutoAnimate · Three.js/Fiber/Drei · Recharts · ECharts · Vercel AI SDK · CopilotKit · Mastra · assistant-ui · Supabase · Lucide

## Запуск
```bash
npm install
cp .env.example .env.local   # вставь Supabase + Agnes ключи (см. SETUP.md)
npm run dev                  # http://localhost:3000
```
Без Supabase работает гостевой режим (AI-чат с ключом, студия, память локально).

## Деплой
Vercel → Import из GitHub → вставь env → Deploy. Подробнее: SETUP.md.

## Структура
- `app/(marketing)` — лендинг · `app/(auth)` — вход/регистрация · `app/(app)` — сеть
- `app/api` — chat (AI SDK stream), copilotkit, ai (one-shot), moderate, digest
- `lib/voice` — Voice SDK (STT/TTS/wake/команды) · `lib/webrtc` — звонки · `lib/mastra` — агент
- `components/glint` — GlintKit (магнит, блик, бегушка, счётчики, tilt)
- `supabase/migrations` — SQL схема + RLS
