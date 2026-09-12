import { generateText } from 'ai';
import { chatModel } from '@/lib/ai/agnes';

const BAD = [/http\S{12,}/, /(казино|ставк|заработок без вложений|крипта.{0,20}удво|интим|эскорт)/i];
export async function POST(req: Request) {
  const { text, apiKey }: { text: string; apiKey?: string } = await req.json();
  const t = String(text || '').slice(0, 2000);
  // 1) бесплатный локальный фильтр — мгновенно
  if (BAD.some(re => re.test(t))) return Response.json({ flag: true, reason: 'local-pattern', score: 0.9 });
  if (t.length > 1500 || /(.)\1{9,}/.test(t)) return Response.json({ flag: true, reason: 'spam-shape', score: 0.7 });
  // 2) LLM-вердикт (если есть ключ)
  if (!process.env.AGNES_API_KEY && !apiKey) return Response.json({ flag: false, score: 0 });
  try {
    const { text: out } = await generateText({
      model: chatModel(apiKey),
      system: 'Ты модератор. Ответь СТРОГО JSON {"flag":true|false,"reason":"...","score":0..1}. Флаг — только для спама, мошенничества, угроз, ненависти, 18+. Обычные грубоватые слова — не флаг.',
      prompt: t,
    });
    const j = JSON.parse(out.replace(/```json|```/g, '').trim());
    return Response.json({ flag: !!j.flag, reason: j.reason || '', score: +j.score || 0 });
  } catch {
    return Response.json({ flag: false, score: 0 });
  }
}
