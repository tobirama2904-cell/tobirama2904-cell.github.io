import { CopilotRuntime, OpenAIAdapter, copilotRuntimeNextJSAppRouterEndpoint } from '@copilotkit/runtime';
import { NextRequest } from 'next/server';
import OpenAI from 'openai';

// Agnes через явный OpenAI-клиент (baseURL + ключ), system-роль как есть
const client = new OpenAI({
  apiKey: process.env.AGNES_API_KEY || process.env.OPENAI_API_KEY || 'no-key',
  baseURL: process.env.NEXT_PUBLIC_AGNES_BASE || process.env.OPENAI_BASE_URL || 'https://apihub.agnes-ai.com/v1',
});
const serviceAdapter = new OpenAIAdapter({
  model: process.env.AGNES_CHAT_MODEL || 'agnes-2.5-flash',
  openai: client,
  keepSystemRole: true,
});
const runtime = new CopilotRuntime();

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({ runtime, serviceAdapter, endpoint: '/api/copilotkit' });
  return handleRequest(req);
};
export const maxDuration = 120;
