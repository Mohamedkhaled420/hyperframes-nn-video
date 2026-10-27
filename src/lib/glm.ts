/* glm.ts — server-only GLM (Z.ai) API client.
   glm-4.7-flash is 100% free ($0 input/output, 200K context) — the default
   brain for research + edit calls. Works on Vercel and locally; no SDK needed.
   NOTE: keep `thinking: { type: 'disabled' }` — glm-4.7-flash is a reasoning
   model and otherwise spends tokens on hidden reasoning_content. */

const GLM_BASE = process.env.GLM_BASE_URL || 'https://api.z.ai/api/paas/v4';
const GLM_MODEL = process.env.GLM_MODEL || 'glm-4.7-flash';

export const hasGLM = () => !!process.env.GLM_API_KEY;

export type GLMMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function glmChat(
  messages: GLMMessage[],
  { maxTokens = 2000, timeoutMs = 60_000, temperature }: { maxTokens?: number; timeoutMs?: number; temperature?: number } = {},
): Promise<string> {
  const key = process.env.GLM_API_KEY;
  if (!key) throw new Error('GLM_API_KEY not configured');
  const body: Record<string, unknown> = {
    model: GLM_MODEL,
    messages,
    max_tokens: maxTokens,
    thinking: { type: 'disabled' },
  };
  if (typeof temperature === 'number') body.temperature = temperature;
  const res = await fetch(`${GLM_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`glm ${res.status}: ${detail || 'rejected'}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content || '';
  if (!content.trim()) throw new Error('glm returned empty content');
  return content;
}
