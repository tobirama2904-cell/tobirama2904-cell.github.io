// Client-side /api/* implementation for the static build.
// Intercepts same-origin /api/ai|moderate|digest|chat and serves them locally.
import { aiCall, moderateText, digestText, chatResponse } from './ai';

let installed = false;
export function installApiShim() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as Request)?.url || String(input);
    try {
      if (url.startsWith('/api/ai')) {
        const b = JSON.parse((init?.body as string) || '{}');
        return Response.json(await aiCall(b));
      }
      if (url.startsWith('/api/moderate')) {
        const b = JSON.parse((init?.body as string) || '{}');
        return Response.json(await moderateText(b.text || '', b.apiKey));
      }
      if (url.startsWith('/api/digest')) {
        const b = JSON.parse((init?.body as string) || '{}');
        return Response.json(await digestText(b.feed || [], b.chats || [], b.apiKey));
      }
      if (url.startsWith('/api/chat')) {
        const b = JSON.parse((init?.body as string) || '{}');
        return await chatResponse({ messages: b.messages || [], system: b.system, apiKey: b.apiKey });
      }
    } catch (e) {
      return Response.json({ error: String(e).slice(0, 300) }, { status: 500 });
    }
    return orig(input as never, init);
  }) as typeof fetch;
}
