import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { chatModel } from '../ai/agnes';

// Mastra-агент Легиона: саммари, дайджесты, модерация. Модель — Agnes (OpenAI-совместимая).
export const summarizeTool = createTool({
  id: 'summarize',
  description: 'Сжать текст в короткое саммари на русском',
  inputSchema: z.object({ text: z.string(), maxSentences: z.number().default(5) }),
  outputSchema: z.object({ summary: z.string() }),
  execute: async ({ context }) => {
    const t = context.text.slice(0, 6000);
    const lines = t.split('\n').filter(Boolean).slice(0, context.maxSentences * 3);
    return { summary: lines.slice(0, context.maxSentences).join('\n') };
  },
});

export function legionAgent(apiKey?: string) {
  return new Agent({
    name: 'legion',
    instructions: 'Ты LEGION. Русский язык, кратко и по делу. Суммируешь ленты и чаты, выделяешь главное, предлагаешь действия.',
    model: chatModel(apiKey) as never,
    tools: { summarize: summarizeTool },
  });
}
