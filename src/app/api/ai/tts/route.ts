/* POST /api/ai/tts → render-service /ai/tts (Deepgram Aura-2 with a key,
   built-in z.ai voice otherwise). Passes audio + X-Provider through. */
import { NextRequest } from 'next/server';
import { proxyAI } from '@/lib/ai-relay';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return proxyAI(req, 'tts');
}
