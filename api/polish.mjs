/* POST /api/polish — visual QA repair for ONE AI-written scene.
   The player runs the pack through a deterministic DOM inspection after
   generation (motionmaxxing's idea: look at the render with scripts, not
   self-certification). When a scene fails the checks, this endpoint rewrites
   it with the findings attached.
   Input : { title, chapter, dur, accent, narr, body, findings }
   Output: { ok, body, html, log }  (ok:false -> player keeps the original)
   Transport: LLM_API_KEY env (any OpenAI-compatible) first, keyless SDK where
   its config exists (sandbox / local companion). */
import { readJson } from '../lib/tutor.mjs';
import {
  sceneSystemCompact, cleanCode, validateBody, assemble, autoplayOff,
} from '../lib/studio_core.mjs';

export const maxDuration = 120;

const LLM_KEY = process.env.LLM_API_KEY || '';
const LLM_BASE = (process.env.LLM_BASE_URL || '').replace(/\/+$/, '');
const LLM_MODEL = process.env.LLM_MODEL || 'glm-4.6';

async function llmViaEnv(messages, maxTokens) {
  const WAITS = [12000, 22000];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(LLM_BASE + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 Authorization: 'Bearer ' + LLM_KEY },
      body: JSON.stringify({ model: LLM_MODEL, temperature: 0.3,
        max_tokens: maxTokens || 2800, messages }),
    });
    if (res.status === 429 && attempt <= WAITS.length) {
      await new Promise(r => setTimeout(r, WAITS[attempt - 1]));
      continue;
    }
    if (!res.ok) throw new Error('LLM HTTP ' + res.status + ': ' +
      (await res.text()).slice(0, 200));
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    if (!text.trim()) throw new Error('empty LLM response');
    return text;
  }
  throw new Error('LLM rate-limited');
}

async function llmViaSdk(messages) {
  const { default: ZAI } = await import('z-ai-web-dev-sdk');
  const client = await ZAI.create();
  const completion = await client.chat.completions.create({
    messages, thinking: { type: 'disabled' },
  });
  const text = completion.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw new Error('empty response from model');
  return text;
}

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'POST only' });
  const b = await readJson(req);
  const oldBody = String(b.body || '');
  const findings = (Array.isArray(b.findings) ? b.findings : [])
    .map(String).filter(Boolean).slice(0, 8);
  const dur = Math.max(10, Math.min(60, +b.dur || 30));
  if (!oldBody || !findings.length)
    return res.status(400).json({ error: 'body and findings are required' });

  const log = [];
  const narr = Array.isArray(b.narr) ? b.narr : [];
  const user =
    `Here is the SCENE BODY you wrote earlier for "${b.title || 'a scene'}" ` +
    `(chapter "${b.chapter || ''}", ${dur}s, accent ${b.accent || 'C.blue'}). ` +
    `Its narration windows are: ${JSON.stringify(narr).slice(0, 900)}\n\n` +
    `AUTOMATED VISUAL QA FOUND THESE PROBLEMS IN THE RENDER:\n` +
    findings.map((f, i) => `${i + 1}. ${f}`).join('\n') + `\n\n` +
    `YOUR PREVIOUS BODY:\n${oldBody}\n\n` +
    `Rewrite the FULL scene body fixing every finding. Keep the concept, ` +
    `labels and timing that already work. Output ONLY the JavaScript body.`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const msgs = [
        { role: 'assistant', content: sceneSystemCompact() },
        { role: 'user', content: attempt === 1 ? user : user +
          '\n\nYour rewrite attempt ' + (attempt - 1) +
          ' was also rejected by QA. Be radical: simplify the layout, keep ' +
          'every visible element inside y 150..820.' },
      ];
      const raw = (LLM_KEY && LLM_BASE ? await llmViaEnv(msgs, 2800)
                                        : await llmViaSdk(msgs));
      const clean = cleanCode(raw);
      const err = validateBody(clean);
      if (err) { log.push('attempt ' + attempt + ': ' + err); continue; }
      log.push('attempt ' + attempt + ': accepted');
      const html = autoplayOff(assemble(dur, b.chapter || 'Chapter',
        b.title || 'Scene', narr, clean));
      return res.status(200).json({ ok: true, body: clean, html, log });
    } catch (e) {
      log.push('attempt ' + attempt + ': ' + String(e && e.message || e).slice(0, 160));
    }
  }
  return res.status(200).json({ ok: false, log });
}
