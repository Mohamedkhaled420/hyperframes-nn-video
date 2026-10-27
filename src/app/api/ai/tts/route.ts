/* POST /api/ai/tts — one short narration clip.
   Provider chain: Deepgram Aura-2 (key from the request body OR the
   DEEPGRAM_API_KEY env var — configured on Vercel, so voices work out of the
   box) → render-service relay (local/sandbox; serves the z-ai built-in voice
   as its own fallback). Returns raw audio with X-Provider / X-Voice headers. */
import { NextRequest } from 'next/server';
import { proxyAI } from '@/lib/ai-relay';

export const runtime = 'nodejs';

const AURA = /^aura(-2)?-[a-z]+-en$/i;
const cache = new Map<string, { buf: Buffer; provider: string; voice: string; mime: string }>();

function audioResponse(entry: { buf: Buffer; provider: string; voice: string; mime: string }) {
  return new Response(new Uint8Array(entry.buf), {
    status: 200,
    headers: {
      'Content-Type': entry.mime,
      'Content-Length': String(entry.buf.length),
      'Cache-Control': 'no-cache',
      'X-Provider': entry.provider,
      'X-Voice': entry.voice,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
    if (!text) return Response.json({ error: 'text required' }, { status: 400 });
    const voice = String(body.voice || 'jam');
    const key = String(body.key || process.env.DEEPGRAM_API_KEY || '').trim();

    const ck = `${voice}:${text}`;
    const hit = cache.get(ck);
    if (hit) return audioResponse(hit);

    /* 1 · Deepgram Aura (natural English — env key on Vercel, body key overrides) */
    if (key && (AURA.test(voice) || voice.startsWith('aura'))) {
      try {
        const model = AURA.test(voice) ? voice : `aura-2-thalia-en`;
        const r = await fetch(`https://api.deepgram.com/v1/speak?model=${model}&encoding=mp3`, {
          method: 'POST',
          headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!r.ok) {
          const detail = (await r.text().catch(() => '')).slice(0, 160);
          return Response.json({ error: `deepgram ${r.status}: ${detail || 'rejected'}` }, { status: r.status === 401 || r.status === 403 ? 401 : r.status === 429 ? 429 : r.status === 402 ? 402 : 502 });
        }
        const buf = Buffer.from(new Uint8Array(await r.arrayBuffer()));
        if (buf.length > 800) {
          const entry = { buf, provider: 'deepgram', voice: model, mime: 'audio/mpeg' };
          if (cache.size > 60) cache.clear();
          cache.set(ck, entry);
          return audioResponse(entry);
        }
      } catch { /* fall through to the relay */ }
    }

    /* 2 · render-service relay (z-ai built-in voice as its fallback).
       NOTE: the original req body was already consumed above, so build a
       fresh request for the relay. */
    const relayReq = new Request('http://relay/ai/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as unknown as NextRequest;
    const relayed = await proxyAI(relayReq, 'tts');
    if (relayed.status !== 503) return relayed;
    return Response.json(
      {
        error: 'no tts provider available',
        hint: 'Set DEEPGRAM_API_KEY (Aura-2 voices) or run the render-service (built-in voice). The studio falls back to the browser voice without it.',
      },
      { status: 503 },
    );
  } catch (e: unknown) {
    return Response.json({ error: String((e as Error)?.message || e || 'tts failed').slice(0, 300) }, { status: 503 });
  }
}
