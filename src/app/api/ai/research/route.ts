/* POST /api/ai/research — LLM drafts the video outline, claims and source types.
   Provider chain: GLM glm-4.7-flash (free, works anywhere — needs GLM_API_KEY,
   set on Vercel) → render-service relay (local/sandbox) → client local draft. */
import { NextRequest } from 'next/server';
import { glmChat, hasGLM } from '@/lib/glm';
import { extractJSON, proxyAI } from '@/lib/ai-relay';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!hasGLM()) return proxyAI(req, 'research'); /* render-service owns the LLM */
  try {
    const body = await req.json();
    const topic = String(body.topic || '').slice(0, 600).trim();
    const audience = String(body.audience || 'General viewers').slice(0, 60);
    const length = Math.max(30, Math.min(600, +body.length || 120));
    if (!topic) return Response.json({ error: 'topic required' }, { status: 400 });

    const n = Math.max(3, Math.min(8, Math.round(length / 25)));
    const system = `You are Lumen, a meticulous video research assistant. You plan short narrated explainer videos.
Reply with STRICT JSON only — no markdown, no commentary. Shape:
{"title":"...","scenes":[{"title":"...","text":"..."} × ${n}],"claims":[{"txt":"...","conf":"High|Medium|Low"} × ${n}],"srcs":[["source type","used in scenes 1–2"],...]}
Rules:
- scenes: a hook, the core ideas in a logical order, one concrete everyday example, a recap. Titles ≤ 6 words.
- text is SPOKEN NARRATION for one scene: 2–3 short sentences, ≤ 45 words, plain language, no stage directions, no lists, no emojis.
- claims: one factual claim per scene with your honest confidence.
- srcs: 4–5 [source type, where used] pairs describing the KINDS of sources to verify against (no fake URLs).`;
    const user = `Topic: ${topic}\nTarget length: ${length} seconds total (~${Math.round(length / n)}s per scene)\nAudience: ${audience}`;

    const raw = await glmChat(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { maxTokens: 2400, timeoutMs: 75_000 },
    );
    const parsed = extractJSON(raw);
    if (!parsed || !Array.isArray(parsed.scenes) || !parsed.scenes.length) {
      return Response.json({ error: 'unparseable research result' }, { status: 502 });
    }
    const scenes = parsed.scenes.slice(0, 10).map((s: { title?: string; text?: string }) => ({
      title: String(s.title || 'Scene').slice(0, 80),
      text: String(s.text || '').slice(0, 600),
    }));
    return Response.json({
      ok: true,
      title: String(parsed.title || topic).slice(0, 80),
      scenes,
      claims: Array.isArray(parsed.claims) ? parsed.claims.slice(0, 10).map((c: { txt?: string; conf?: string }) => ({
        txt: String(c.txt || '').slice(0, 200),
        conf: ['High', 'Medium', 'Low'].includes(String(c.conf)) ? c.conf : 'Medium',
      })) : [],
      srcs: Array.isArray(parsed.srcs) ? parsed.srcs.slice(0, 6).map((s: unknown[]) => [String(s[0] || '').slice(0, 90), String(s[1] || '').slice(0, 60)]) : [],
      provider: 'glm-4.7-flash',
    });
  } catch (e: unknown) {
    return Response.json({ error: String((e as Error)?.message || e || 'research failed').slice(0, 300) }, { status: 503 });
  }
}
