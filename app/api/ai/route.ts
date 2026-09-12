import { generateText } from 'ai';
import { chatModel } from '@/lib/ai/agnes';

// One-shot AI: текст (саммари/переводы/улучшения) + картинки (аватары/посты)
const IMG_MODELS = ['agnes-image-2.1-flash', 'agnes-image-2.5-flash', 'agnes-image-2.0'];
export async function POST(req: Request) {
  const { system, prompt, apiKey, max = 800, mode = 'text', size = '1024x1024' }:
    { system?: string; prompt: string; apiKey?: string; max?: number; mode?: string; size?: string } = await req.json();
  const key = apiKey || process.env.AGNES_API_KEY;
  if (!key) return Response.json({ text: '', image: '' });
  if (mode === 'image') {
    const base = process.env.NEXT_PUBLIC_AGNES_BASE || 'https://apihub.agnes-ai.com/v1';
    for (const model of IMG_MODELS) {
      try {
        const r = await fetch(base + '/images/generations', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify({ model, prompt: String(prompt).slice(0, 1000), size, n: 1 }),
        });
        const j = await r.json();
        const d = j.data && j.data[0];
        const url = d && (d.url || (d.b64_json ? 'data:image/png;base64,' + d.b64_json : ''));
        if (url) return Response.json({ image: url, model });
      } catch { /* next model */ }
    }
    return Response.json({ image: '', error: 'image failed' });
  }
  try {
    const { text } = await generateText({ model: chatModel(apiKey), system: system || 'Отвечай по-русски, коротко.', prompt: String(prompt).slice(0, 6000) });
    return Response.json({ text });
  } catch (e) { return Response.json({ text: '', error: String(e).slice(0, 200) }); }
}
export const maxDuration = 60;
