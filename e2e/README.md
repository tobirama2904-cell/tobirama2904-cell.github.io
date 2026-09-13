# LEGION E2E (Playwright, 22 проверки)
Сквозной тест двух реальных пользователей через публичные реле: регистрация,
админка, посты, хештеги, опросы+голоса, каталог, DM туда-обратно, DM-аудит,
профиль, Copilot, /create, клипы, голосовые комнаты + P2P.
```bash
npm i playwright && npx playwright install chromium
npx playwright install-deps chromium   # sudo, системные библиотеки
python3 -m http.server 8905 -d out &   # собранный out/
node e2e/e2e.mjs
```
