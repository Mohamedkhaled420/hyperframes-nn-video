/* POST /api/ai/edit → render-service /ai/edit (LLM edit ops). */
import { NextRequest } from 'next/server';
import { proxyAI } from '@/lib/ai-relay';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return proxyAI(req, 'edit');
}
