import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const baseURL = process.env.NEXT_PUBLIC_AGNES_BASE || 'https://apihub.agnes-ai.com/v1';
export const CHAT_MODEL = process.env.AGNES_CHAT_MODEL || 'agnes-2.5-flash';

// Agnes — OpenAI-совместимый провайдер, но БЕЗ Responses API → только Chat Completions.
export function agnes(apiKey?: string) {
  return createOpenAICompatible({ name: 'agnes', baseURL, apiKey: apiKey || process.env.AGNES_API_KEY || 'no-key' });
}
export function chatModel(apiKey?: string) {
  return agnes(apiKey)(CHAT_MODEL);
}
export const SYS_LEGION = `Ты LEGION — персональный ИИ-агент. Русский язык, живой стиль, по делу, без воды. Ты внутри соцсети LEGION: помогаешь с постами, сообщениями, кодом, вопросами. Форматируй markdown умеренно.`;
