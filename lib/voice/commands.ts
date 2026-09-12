'use client';
// Голосовые команды по всему сайту. Возвращает true если команда выполнена.
export interface CmdCtx {
  go: (path: string) => void;
  toggleTheme: () => void;
  openCmdk: () => void;
  notify: (t: string) => void;
  speak: (t: string) => void;
  extra?: (text: string) => boolean; // page-specific
}
export function runVoiceCommand(raw: string, ctx: CmdCtx): boolean {
  const t = raw.toLowerCase().trim();
  const pages: [RegExp, string][] = [
    [/(чат|диалог|беседа|assistant|аи)\b.*(легион)?|открой чат/, '/chat'],
    [/(лента|новости|посты|соцсеть)/, '/feed'],
    [/(сообщен|мессенджер|диалоги|напиши)/, '/messages'],
    [/(голос|микрофон|скажи)/, '/voice'],
    [/(студи|файл|фото|видео|анализ)/, '/studio'],
    [/(память|профиль памяти|запомни)/, '/memory'],
    [/(задач|легион|миссии)/, '/missions'],
    [/(статист|графики|дашборд|аналитика)/, '/stats'],
    [/(люди|пользователи|кто онлайн|каталог)/, '/users'],
    [/(админ|панель)/, '/admin'],
    [/(главн|домой|лендинг)/, '/'],
  ];
  for (const [re, path] of pages) if (re.test(t)) { ctx.go(path); ctx.speak('Открываю'); return true; }
  if (/(тёмная|темная|ночная) тем/.test(t)) { ctx.toggleTheme(); return true; }
  if (/(светлая|дневная) тем/.test(t)) { ctx.toggleTheme(); return true; }
  if (/(смени|переключи) тем/.test(t)) { ctx.toggleTheme(); ctx.speak('Тему сменил'); return true; }
  if (/(команд|поиск|найди)/.test(t) && /(открой|покажи)/.test(t)) { ctx.openCmdk(); return true; }
  if (/^(стоп|замолчи|тихо|хватит)/.test(t)) { ctx.notify('Остановлено голосом'); return true; }
  if (ctx.extra && ctx.extra(t)) return true;
  return false;
}
