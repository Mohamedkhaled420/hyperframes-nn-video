/* POST /api/ask — AI tutor.
   Tries, in order: LLM_API_KEY/LLM_BASE_URL env config (any OpenAI-compatible
   API) -> keyless z-ai-web-dev-sdk (needs .z-ai-config) -> offline fallback
   that answers from the embedded narration + scene notes. */
import { systemFor, readJson, answer } from '../lib/tutor.mjs';

export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'POST only' });
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
    const r = await answer({ question, chapter, t, pack, history });
    return res.status(200).json({
      answer: r.answer, chapter, mode: r.mode,
      model: r.model || undefined,
      elapsed_ms: r.elapsed_ms || 0,
      // why earlier tiers failed (e.g. ["env-llm: LLM HTTP 401: Invalid API Key"])
      errors: Array.isArray(r.errors) ? r.errors : undefined,
    });
  } catch (err) {
    return res.status(502).json({ error: 'tutor failed: ' + (err && err.message || err) });
  }
}
