// Agnes AI direct from the browser (no server needed).
// Same shapes as the old /api/* routes so all UI keeps working.
import { generateText, streamText, convertToModelMessages, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { chatModel, SYS_LEGION } from '../ai/agnes';
import { legionTools } from '../ai/tools';
import { AGNES_BASE, AGNES_KEY_BUILD } from './config';

export function agnesKey(explicit?: string): string {
  if (explicit) return explicit;
  try {
    const l = localStorage.getItem('legion-agnes-key');
    if (l) return l;
  } catch {}
  return AGNES_KEY_BUILD || '';
}

// ~20 req/min free-tier guard: serialize AI calls with a 3.1s gap
let lastCall = 0;
let chain: Promise<void> = Promise.resolve();
function rpm(): Promise<void> {
  const run = chain.then(async () => {
    const w = Math.max(0, 3100 - (Date.now() - lastCall));
    if (w) await new Promise(r => setTimeout(r, w));
    lastCall = Date.now();
  });
  chain = run.catch(() => {});
  return run;
}

const IMG_MODELS = ['agnes-image-2.1-flash', 'agnes-image-2.5-flash', 'agnes-image-2.0'];
export interface AiCallBody { system?: string; prompt: string; apiKey?: string; max?: number; mode?: string; size?: string }
export async function aiCall(b: AiCallBody): Promise<{ text?: string; image?: string; model?: string; error?: string }> {
  const key = agnesKey(b.apiKey);
  if (!key) return { text: '', image: '' };
  if (b.mode === 'image') {
    for (const model of IMG_MODELS) {
      try {
        await rpm();
        const r = await fetch(AGNES_BASE + '/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify({ model, prompt: String(b.prompt).slice(0, 1000), size: b.size || '1024x1024', n: 1 }),
        });
        const j = await r.json();
        const d = j.data && j.data[0];
        const url = d && (d.url || (d.b64_json ? 'data:image/png;base64,' + d.b64_json : ''));
        if (url) return { image: url, model };
      } catch { /* next model */ }
    }
    return { image: '', error: 'image failed' };
  }
  try {
    await rpm();
    const { text } = await generateText({
      model: chatModel(key),
      system: b.system || 'Отвечай по-русски, коротко.',
      prompt: String(b.prompt).slice(0, 6000),
    });
    return { text };
  } catch (e) {
    return { text: '', error: String(e).slice(0, 200) };
  }
}

const BAD = [/http\S{12,}/, /(казино|ставк|заработок без вложений|крипта.{0,20}удво|интим|эскорт)/i];
export async function moderateText(text: string, apiKey?: string): Promise<{ flag: boolean; reason?: string; score: number }> {
  const t = String(text || '').slice(0, 2000);
  if (BAD.some(re => re.test(t))) return { flag: true, reason: 'local-pattern', score: 0.9 };
  if (t.length > 1500 || /(.)\1{9,}/.test(t)) return { flag: true, reason: 'spam-shape', score: 0.7 };
  const key = agnesKey(apiKey);
  if (!key) return { flag: false, score: 0 };
  try {
    await rpm();
    const { text: out } = await generateText({
      model: chatModel(key),
      system: 'Ты модератор. Ответь СТРОГО JSON {"flag":true|false,"reason":"...","score":0..1}. Флаг — только для спама, мошенничества, угроз, ненависти, 18+. Обычные грубоватые слова — не флаг.',
      prompt: t,
    });
    const j = JSON.parse(out.replace(/```json|```/g, '').trim());
    return { flag: !!j.flag, reason: j.reason || '', score: +j.score || 0 };
  } catch {
    return { flag: false, score: 0 };
  }
}

const DIGEST_SYS = 'Ты LEGION. Собери живой дайджест «что нового»: 5-8 буллетов, главное сверху, имена, цифры. Русский.';
export async function digestText(feed: string[], chats: string[], apiKey?: string): Promise<{ digest: string; via: string }> {
  const key = agnesKey(apiKey);
  if (!key) return { digest: 'Дайджест требует Agnes-ключ (кнопка «Ключ» в AI Чате).', via: 'none' };
  const prompt = `ЛЕНТА:\n${(feed || []).join('\n').slice(0, 4000)}\n\nЧАТЫ:\n${(chats || []).join('\n').slice(0, 4000)}`;
  await rpm();
  const { text } = await generateText({ model: chatModel(key), system: DIGEST_SYS, prompt });
  return { digest: text, via: 'sdk' };
}

export async function chatResponse(body: { messages: unknown[]; system?: string; apiKey?: string }): Promise<Response> {
  const key = agnesKey(body.apiKey);
  if (!key) return new Response('Нет Agnes-ключа. Вставь ключ кнопкой «Ключ».', { status: 400 });
  await rpm();
  const result = streamText({
    model: chatModel(key),
    system: body.system || SYS_LEGION,
    messages: convertToModelMessages(body.messages as never),
    tools: legionTools,
    stopWhen: stepCountIs(4),
  });
  return result.toUIMessageStreamResponse();
}

export async function* copilotStream(
  history: { role: 'user' | 'assistant'; text: string }[],
  page: string,
  nav: (href: string) => void,
  theme: () => void,
  apiKey?: string,
): AsyncGenerator<string> {
  const key = agnesKey(apiKey);
  if (!key) {
    yield '⚠ Вставь Agnes-ключ в AI Чате (кнопка «Ключ»), и я оживу.';
    return;
  }
  await rpm();
  const result = streamText({
    model: chatModel(key),
    system: `Ты LEGION Copilot внутри соцсети. Текущая страница: ${page}. Отвечай по-русски, коротко и по делу. Когда просят перейти куда-то — вызови navigate. Когда просят сменить тему — toggleTheme.`,
    messages: history.map(h => ({ role: h.role, content: h.text })) as never,
    tools: {
      navigate: tool({
        description: 'Перейти на страницу',
        inputSchema: z.object({ href: z.string().describe('Путь: /chat /feed /messages /voice /studio /memory /missions /stats /users /admin') }),
        execute: async ({ href }: { href: string }) => { nav(href); return 'Перешёл на ' + href; },
      }),
      toggleTheme: tool({
        description: 'Сменить светлую/тёмную тему',
        inputSchema: z.object({}),
        execute: async () => { theme(); return 'Тему сменил'; },
      }),
    },
    stopWhen: stepCountIs(3),
  });
  for await (const chunk of result.textStream) yield chunk;
}
