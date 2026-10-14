/* POST /api/ask — AI tutor (keyless GLM via z-ai-web-dev-sdk). */
import ZAI from 'z-ai-web-dev-sdk';
import { systemFor, readJson } from '../lib/tutor.mjs';

export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'POST only' });
  const started = Date.now();
  const body = await readJson(req);
  const question = String(body.question || '').trim();
  if (!question) return res.status(400).json({ error: 'question is required' });
  const chapter = Number.isFinite(+body.chapter) ? +body.chapter : 0;
  const t = Number.isFinite(+body.t) ? +body.t : 0;
  const pack = body.pack && /^[a-z0-9-]{1,64}$/.test(body.pack) ? body.pack : null;
  if (pack && pack !== 'bundled')
    return res.status(404).json({ error:
      'unknown pack on this deployment — AI-generated packs live on the companion server' });
  const history = Array.isArray(body.history)
    ? body.history.filter(m => m && typeof m.content === 'string'
        && (m.role === 'user' || m.role === 'assistant')).slice(-6)
    : [];
  try {
    const client = await ZAI.create();
    const completion = await client.chat.completions.create({
      messages: [
        { role: 'assistant', content: systemFor(chapter, t, pack) },
        ...history,
        { role: 'user', content: question },
      ],
      thinking: { type: 'disabled' },
    });
    const answer = completion.choices?.[0]?.message?.content || '';
    if (!answer.trim()) throw new Error('empty response from model');
    return res.status(200).json({ answer, chapter, elapsed_ms: Date.now() - started });
  } catch (err) {
    return res.status(502).json({ error: 'GLM request failed: ' + (err && err.message || err) });
  }
}
