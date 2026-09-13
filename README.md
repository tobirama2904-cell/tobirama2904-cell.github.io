# LEGION v20 — AI-соцсеть на гибридных рельсах

Мессенджер + соцсеть + личный ИИ-агент с голосовым управлением. Ноль серверов, всё бесплатно и безлимитно.

**Живой сайт:** https://tobirama2904-cell.github.io/

## Как устроено (без серверов)
- Аккаунты — Nostr-ключи (email+пароль детерминированно, импорт nsec, Telegram-вход)
- Лента, профили, лайки, подписки, сторис — Nostr-релеи (multi-relay)
- Личка — шифрованный NIP-04 · Группы/каналы — Nostr-лог + живые P2P-комнаты · Публичные группы — NIP-29
- Звонки — WebRTC P2P · Файлы/аватары/голосовые — бесплатные хосты + Telegram · Большие файлы — торренты в браузере
- ИИ — Agnes напрямую из браузера · Хостинг — статика (GitHub/Cloudflare Pages, безлимит)

## Запуск
```bash
npm install
npm run dev   # http://localhost:3000 — работает сразу, без ключей и env
```

## Деплой
```bash
npm run build  # -> out/ (статика)
```
Залей `out/` на GitHub Pages или Cloudflare Pages. Подробнее: SETUP.md.

## Структура
- `app/(app)` — сеть · `app/(auth)` — вход/регистрация · лендинг — `/`
- `lib/hybrid/` — движок: identity, nostr/social, dm, live, calls, storage, torrent, ai, notify
- `lib/supabase/client.ts` — совместимый слой данных (весь UI работает поверх гибрида)
