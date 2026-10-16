/* Relay to the local render-service (:3030) — heavy pipeline lives outside the
   Next.js server so headless Chromium + ffmpeg + TTS never block the UI server. */
import { NextRequest } from 'next/server';

const UPSTREAM = process.env.RENDER_SERVICE_URL || 'http://127.0.0.1:3030';

async function proxy(req: NextRequest, sub: string) {
  const url = `${UPSTREAM}${sub}`;
  const init: RequestInit = {
    method: req.method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (req.method === 'POST') init.body = await req.text();
  const upstream = await fetch(url, init);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
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
