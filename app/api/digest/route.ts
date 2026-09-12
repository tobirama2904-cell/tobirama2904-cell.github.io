import { generateText } from 'ai';
import { chatModel } from '@/lib/ai/agnes';

const SYS = 'Ты LEGION. Собери живой дайджест «что нового»: 5-8 буллетов, главное сверху, имена, цифры. Русский.';

export async function POST(req: Request) {
  const { feed, chats, apiKey }: { feed: string[]; chats: string[]; apiKey?: string } = await req.json();
  if (!process.env.AGNES_API_KEY && !apiKey) return Response.json({ digest: 'Дайджест требует AGNES_API_KEY.' });
  const prompt = `ЛЕНТА:\n${(feed || []).join('\n').slice(0, 4000)}\n\nЧАТЫ:\n${(chats || []).join('\n').slice(0, 4000)}`;
  // Mastra-агент первым, fallback — прямой AI SDK
  try {
    const { legionAgent } = await import('@/lib/mastra/agent');
    const agent = legionAgent(apiKey);
    const out = await agent.generate([{ role: 'user', content: SYS + '\n\n' + prompt }]);
    if (out.text) return Response.json({ digest: out.text, via: 'mastra' });
  } catch (e) { console.warn('mastra fallback:', String(e).slice(0, 120)); }
  const { text } = await generateText({ model: chatModel(apiKey), system: SYS, prompt });
  return Response.json({ digest: text, via: 'sdk' });
}
export const maxDuration = 60;
