/* POST /api/ai/edit — LLM turns a natural-language edit request into ops the
   studio can apply. Provider chain: GLM glm-4.7-flash (free, works anywhere —
   needs GLM_API_KEY, set on Vercel) → render-service relay (local/sandbox).
   The client validates every op again and falls back to rule-based edits. */
import { NextRequest } from 'next/server';
import { glmChat, hasGLM } from '@/lib/glm';
import { extractJSON, proxyAI } from '@/lib/ai-relay';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!hasGLM()) return proxyAI(req, 'edit'); /* render-service owns the LLM */
  try {
    const body = await req.json();
    const q = String(body.q || '').slice(0, 400).trim();
    if (!q) return Response.json({ error: 'q required' }, { status: 400 });
    const scenes = Array.isArray(body.scenes) ? body.scenes.slice(0, 30) : [];
    const assets = Array.isArray(body.assets) ? body.assets.slice(0, 20) : [];
    const idx = Math.max(0, Math.min(scenes.length - 1, +body.idx || 0));

    const system = `You are the editing brain of a video studio. You receive the current project and one user request, and reply with STRICT JSON only:
{"ops":[...],"reply":"one short sentence"}
Allowed ops (apply ONLY what the request needs — usually 1-2 ops):
{"op":"setScene","i":<0-based>,"patch":{"title":"...","text":"...","dur":<seconds>}}
{"op":"addScene","i":<insert at 0-based index>,"scene":{"title":"...","text":"2-3 short spoken sentences","dur":<seconds>,"bg":""}}
{"op":"removeScene","i":<0-based>}
{"op":"fitAll"}
{"op":"setStyle","name":"<exact style name from the list>"}
{"op":"setVoice","voice":"<exact voice id from the list>"}
{"op":"setMusic","assetId":"<id>"}
{"op":"setLogo","assetId":"<id>"}
{"op":"setBg","i":<0-based>,"assetId":"<id>"}
Rules:
- narration "text" is spoken: 2-3 short sentences, ≤ 45 words, no stage directions.
- use the user's language for text/reply (default English).
- only reference styles/voices/assets that exist in the provided lists.
- "reply" describes exactly what you changed.`;

    const user = `Current style: ${String(body.style || '')}
Current voice: ${String(body.voice || '')}
Currently selected scene index: ${idx}
Scenes: ${JSON.stringify(scenes.map((s: { title: string; text: string; dur: number }, i: number) => ({ i, title: s.title, dur: s.dur, text: s.text.slice(0, 220) })))}
Assets: ${JSON.stringify(assets.map((a: { id: string; name: string; desc: string; type: string }) => ({ id: a.id, name: a.name, desc: a.desc, type: a.type })))}
Request: ${q}`;

    const raw = await glmChat(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { maxTokens: 1200, timeoutMs: 60_000 },
    );
    const parsed = extractJSON(raw);
    if (!parsed || !Array.isArray(parsed.ops) || !parsed.ops.length) {
      return Response.json({ error: 'unparseable edit result' }, { status: 502 });
    }
    return Response.json({
      ok: true,
      ops: parsed.ops.slice(0, 40),
      reply: String(parsed.reply || 'Done.').slice(0, 220),
      provider: 'glm-4.7-flash',
    });
  } catch (e: unknown) {
    return Response.json({ error: String((e as Error)?.message || e || 'edit failed').slice(0, 300) }, { status: 503 });
  }
}
