/* Relay to the local render-service (:3030) — heavy pipeline lives outside the
   Next.js server so headless Chromium + ffmpeg + TTS never block the UI server.

   On hosts without the render-service (e.g. Vercel serverless), every call
   returns a clean 503 JSON instead of crashing — the player UI keeps working
   for browsing/playing packs; point RENDER_SERVICE_URL at a reachable host
   (tunnel / VPS) to enable TTS + export + generation remotely. */
import { NextRequest } from 'next/server';

const UPSTREAM = process.env.RENDER_SERVICE_URL || 'http://127.0.0.1:3030';

async function proxy(req: NextRequest, sub: string) {
  const url = `${UPSTREAM}${sub}`;
  const init: RequestInit = {
    method: req.method,
    headers: { 'Content-Type': 'application/json' },
    // @ts-expect-error -- undici-only flag, fine at runtime on Node
    duplex: 'half',
    signal: AbortSignal.timeout(10 * 60_000), // render jobs can take a while
  };
  if (req.method === 'POST') init.body = await req.text();
  try {
    const upstream = await fetch(url, init);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (err: any) {
    return Response.json(
      {
        error: 'render-service unreachable',
        upstream: url,
        detail: String(err?.cause?.code || err?.message || err),
        hint: 'Start mini-services/render-service (node index.mjs) locally, or set RENDER_SERVICE_URL to a publicly reachable host running it. The player UI itself works without it.',
      },
      { status: 503 }
    );
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path: parts } = await ctx.params;
  return proxy(req, '/' + parts.join('/') + (req.nextUrl.search || ''));
}
export async function POST(req: NextRequest, ctx: Ctx) {
  const { path: parts } = await ctx.params;
  return proxy(req, '/' + parts.join('/'));
}
export async function OPTIONS() { return new Response(null, { status: 204 }); }
