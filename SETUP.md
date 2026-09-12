# LEGION: запуск за 10 минут (всё бесплатно)

## 1. Supabase — база, акки, realtime (5 мин)
1. Зайди на https://supabase.com/dashboard → New Project (free) → имя `legion` → придумай DB-пароль → Create.
2. Дождись готовности → слева **SQL Editor** → New Query → вставь ВЕСЬ файл `supabase/migrations/001_init.sql` → Run. Потом так же `002_ban.sql`, `003_pinned.sql` и `004_notifications.sql`.
3. Слева **Database → Replication**: включи realtime для таблиц `messages`, `notifications`, `posts` (Source → включатель).
4. Слева **Storage**: проверь бакеты `avatars`, `media`, `voice` (создаются SQL; если нет — создай руками, avatars/media — Public).
5. Слева **Project Settings → API**: скопируй `Project URL` и `anon public key` → вставь в `.env.local` / Vercel env:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
6. Готово: регистрация, лента, мессенджер, звонки, админка — живые.

## 2. Вход через Google/GitHub (5 мин, необязательно)
1. Google: https://console.cloud.google.com → New Project → APIs & Services → OAuth consent screen (External) → Create OAuth Client (Web) → Authorized redirect URI: `https://ТВОЙ-PROJECT.supabase.co/auth/v1/callback` → скопируй Client ID/Secret.
2. Supabase → **Authentication → Providers → Google** → Enable → вставь ID/Secret → Save.
3. GitHub: github.com → Settings → Developer settings → OAuth Apps → New → Callback URL тот же → Client ID/Secret → Supabase Providers → GitHub → Enable.

## 3. Agnes AI ключ (2 мин)
1. Возьми бесплатный ключ: platform.agnes-ai.com
2. Вариант А (для всех): вставь в env `AGNES_API_KEY` на Vercel.
3. Вариант Б (лично): в приложении AI Чат → кнопка «Ключ» → ключ хранится в твоём браузере.

## 4. Деплой на Vercel (3 мин, бесплатно)
1. Запушь этот код на GitHub.
2. https://vercel.com → Add New → Project → Import репозиторий → Deploy.
3. Project → Settings → Environment Variables → добавь все из `.env.example` → Redeploy.
4. Открой свой `https://legion-xxx.vercel.app` → зарегистрируйся под `tobirama2904@gmail.com` → ты админ (роль выдаётся автоматически).

## Админ
Первый вход под email из `ADMIN_EMAILS` (по умолчанию tobirama2904@gmail.com) автоматически получает роль `admin` + пункт «Админка»: юзеры, баны, галочки, активность, жалобы, рассылка, аудит чатов.
