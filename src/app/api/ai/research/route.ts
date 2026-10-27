/* POST /api/ai/research → render-service /ai/research (LLM outline). */
import { NextRequest } from 'next/server';
import { proxyAI } from '@/lib/ai-relay';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return proxyAI(req, 'research');
}
