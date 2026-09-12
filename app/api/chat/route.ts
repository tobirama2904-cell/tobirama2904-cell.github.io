import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { chatModel, SYS_LEGION } from '@/lib/ai/agnes';
import { legionTools } from '@/lib/ai/tools';

export const maxDuration = 120;

export async function POST(req: Request) {
  const { messages, system, apiKey }: { messages: UIMessage[]; system?: string; apiKey?: string } = await req.json();
  if (!process.env.AGNES_API_KEY && !apiKey) {
    return new Response('Нет AGNES_API_KEY. Добавь ключ в .env или в настройках.', { status: 400 });
  }
  const result = streamText({
    model: chatModel(apiKey),
    system: system || SYS_LEGION,
    messages: convertToModelMessages(messages),
    tools: legionTools,
    stopWhen: stepCountIs(4),
  });
  return result.toUIMessageStreamResponse();
}
