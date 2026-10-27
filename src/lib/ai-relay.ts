/* ai-relay.ts — server util: forward /api/ai/* calls to the render-service,
   which owns the LLM + TTS providers (z-ai SDK, Deepgram). On Vercel the
   routes call GLM + Deepgram directly (see lib/glm.ts) and only fall back to
   this relay — otherwise it 503s cleanly and the client falls back to its
   local draft / rule-based edits / browser voice. */
import { NextRequest } from 'next/server';

const UPSTREAM = process.env.RENDER_SERVICE_URL || 'http://127.0.0.1:3030';

/* strip ```json fences and extract the first JSON object from an LLM reply */
export function extractJSON(text: string): any | null {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(cleaned); } catch { /* keep trying */ }
  const s = cleaned.indexOf('{');
  const e = cleaned.lastIndexOf('}');
  if (s >= 0 && e > s) {
    try { return JSON.parse(cleaned.slice(s, e + 1)); } catch { return null; }
  }
  return null;
}

export async function proxyAI(req: NextRequest, sub: string) {
  const url = `${UPSTREAM}/ai/${sub.replace(/^\/+/, '')}`;
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // @ts-expect-error -- undici-only flag, fine at runtime on Node
    duplex: 'half',
    signal: AbortSignal.timeout(120_000),
  };
  if (req.method === 'POST') init.body = await req.text();
  try {
    const upstream = await fetch(url, init);
    const headers: Record<string, string> = {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-cache, no-transform',
    };
    for (const h of ['x-provider', 'x-voice']) {
      const v = upstream.headers.get(h);
      if (v) headers[h] = v;
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (err: unknown) {
    return Response.json(
      {
        error: 'render-service unreachable',
        upstream: url,
        detail: String((err as { cause?: { code?: string } })?.cause?.code || (err as Error)?.message || err),
        hint: 'Start mini-services/render-service locally (node index.mjs) or set RENDER_SERVICE_URL. The studio falls back to offline drafts and the browser voice without it.',
      },
      { status: 503 }
    );
  }
}
