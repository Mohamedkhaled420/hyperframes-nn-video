/* Shared tutor context for the serverless AI tutor (api/ask.mjs).
   Mirrors glm_server.mjs so answers never drift between the companion
   server and the Vercel deployment. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NARRATION_MD, SCENE_DOCS } from './api_bundle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SYSTEM_BASE =
`You are the AI tutor living inside the video player of "How does a machine learn
to read?" — an 11-minute explainer video that builds and trains a real neural
network: a 35→12→10 digit classifier (35 pixels in, 12 hidden sigmoid neurons,
10 softmax outputs, one per digit), trained 300 epochs with cross-entropy loss,
gradient descent and backpropagation, reaching 100% train and test accuracy.
The network has 562 weights and biases — the video calls them "knobs".

The video's 12 chapters: Prologue (the problem) · Pictures are numbers · A single
neuron · Layers · The knobs · Running the network · How wrong is it? · Gradient
descent · Who is to blame? (backprop) · Training · What did it learn? · Recap.

HOW TO ANSWER
- Match the video's friendly, concrete teaching style. Plain English first.
- Keep it tight: 2-6 short sentences, or at most 5 short bullets.
- Use the video's actual numbers and terms (562 knobs, 35/12/10, sigmoid,
  softmax, cross-entropy, learning rate 2.0, 300 epochs, 100% test accuracy).
- Explain what the viewer is watching in the current chapter; link back to
  earlier chapters when it helps.
- If the question goes beyond the video, still answer — briefly and correctly,
  from your own knowledge. Never invent content that contradicts the video.
- If asked for code, give a tiny runnable snippet (Python/NumPy or JS).`;

const SYSTEM_GEN =
`You are the AI tutor inside a Hyperframes video player. The viewer may switch
between several videos: the bundled "How does a machine learn to read?" and
AI-generated packs. Answer about the chapter currently on screen, in 2-6 short
sentences or at most 5 bullets, friendly and concrete. If the current video is
not the bundled one, base your answer ONLY on its narration shown below (plus
safe general knowledge); never claim numbers that are not in it.`;

let _narr = null, _docs = null;

function narrChapters() {
  if (_narr) return _narr;
  // embedded bundle: travels with the serverless function, cannot 404/ENOENT
  _narr = NARRATION_MD.split(/^## /m).slice(1).map(s => '## ' + s.trim());
  return _narr;
}

function sceneDocs() {
  if (_docs) return _docs;
  _docs = SCENE_DOCS.map(d => d.md);
  return _docs;
}

function systemFor(chapter, t, pack) {
  const mmss = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const c = Math.max(0, Math.min(11, chapter | 0));
  if (pack && pack !== 'bundled') {
    // generated packs are not part of serverless deployments; guard anyway
    let secs = [];
    try {
      const md = fs.readFileSync(
        path.join(ROOT, 'generated', pack, 'narration_script.md'), 'utf8');
      secs = md.split(/^## /m).slice(1).map(s => '## ' + s.trim());
    } catch {}
    return `${SYSTEM_GEN}

THE VIEWER IS at ${mmss}, chapter ${(chapter | 0) + 1} of the CURRENT video
("${pack}"). Here is its narration script for context:

${secs.join('\n\n') || '(no narration available)'}`;
  }
  return `${SYSTEM_BASE}

THE VIEWER IS RIGHT NOW at ${mmss} of the video, watching chapter ${c + 1}/12.
Their question is most likely about this chapter — here is its narration:

${narrChapters()[c] || '(no narration available)'}

AND HERE ARE ITS SCENE NOTES:

${sceneDocs()[c] || '(no notes available)'}`;
}

/* Vercel's Node helper pre-parses JSON into req.body; a plain IncomingMessage
   (local tests) does not — handle both. */
async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

/* ---------- answer pipeline: env-LLM -> keyless SDK -> offline fallback ----
   The keyless SDK only works where a .z-ai-config exists (this sandbox, some
   local setups). On Vercel there is none, so:
   1. LLM_API_KEY + LLM_BASE_URL env vars -> any OpenAI-compatible API
   2. z-ai-web-dev-sdk -> works if a config file exists
   3. offline fallback -> answers from the embedded narration + scene notes
      (honestly labeled; keeps Ask AI useful with zero configuration) */
const LLM_KEY = process.env.LLM_API_KEY || '';
const LLM_BASE = (process.env.LLM_BASE_URL || '').replace(/\/+$/, '');
const LLM_MODEL = process.env.LLM_MODEL || 'glm-4.6';
/* Tier 2 (optional): a second OpenAI-compatible provider tried when tier 1
   fails (rate limit, retired model, outage). Any of these free tiers works —
   see github.com/nejib1/Free-LLM directory:
     Z.AI (GLM)   base https://api.z.ai/api/paas/v4        models glm-4.5-flash / glm-4.7-flash
     Google AI    base https://generativelanguage.googleapis.com/v1beta/openai   models gemini-*-flash
     Mistral      base https://api.mistral.ai/v1           models mistral-small-latest etc.
     OpenRouter   base https://openrouter.ai/api/v1        models <vendor>/<model>:free */
const LLM2_KEY = process.env.LLM2_API_KEY || '';
const LLM2_BASE = (process.env.LLM2_BASE_URL || '').replace(/\/+$/, '');
const LLM2_MODEL = process.env.LLM2_MODEL || '';

const STOP = new Set(('the a an is are was were be been to of and or in on for with what how why when ' +
  'who does do did this that these those it its by at as from can could will would should not no yes ' +
  'about into over under again then once here there all any both each few more most other some such ' +
  'only own same so than too very just one two video chapter').split(' '));

function offlineAnswer(question, chapter, t, pack) {
  if (pack && pack !== 'bundled')
    throw new Error('offline fallback only covers the bundled pack');
  const narr = narrChapters(), docs = sceneDocs();
  const c = Math.max(0, Math.min(11, chapter | 0));
  const words = (String(question).toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(w => w.length > 2 && !STOP.has(w));
  let best = c, bestScore = -1;
  narr.forEach((ch, i) => {
    const hay = (ch + ' ' + (docs[i] || '')).toLowerCase();
    let s = 0;
    for (const w of words) if (hay.includes(w)) s += 1;
    if (i === c) s += 0.5;              // prefer the chapter on screen
    if (s > bestScore) { bestScore = s; best = i; }
  });
  const title = ((narr[best] || '').split('\n')[0] || '').replace(/^##\s*/, '');
  const body = [narr[best], docs[best]].filter(Boolean).join('\n\n')
    .replace(/\s+/g, ' ').trim().slice(0, 800);
  return {
    mode: 'fallback',
    answer:
`[offline mode — no AI backend is configured on this deployment, so here is the video's own script for the matching chapter. For full AI answers run the companion server locally: bun glm_server.mjs]

Chapter ${best + 1}/12 — ${title}:

${body}...`,
  };
}

async function llmViaEnv(base, key, model, system, history, question) {
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json',
               Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model, temperature: 0.4, max_tokens: 600,
      messages: [{ role: 'system', content: system },
                 ...history,
                 { role: 'user', content: question }] }),
  });
  if (!res.ok) throw new Error('LLM HTTP ' + res.status + ': ' +
    (await res.text()).slice(0, 200));
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw new Error('empty LLM response');
  return text;
}

async function llmViaSdk(system, history, question) {
  const { default: ZAI } = await import('z-ai-web-dev-sdk');
  const client = await ZAI.create();
  const completion = await client.chat.completions.create({
    messages: [{ role: 'assistant', content: system },   // SDK contract: system rides as assistant
               ...history,
               { role: 'user', content: question }],
    thinking: { type: 'disabled' },
  });
  const text = completion.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw new Error('empty response from model');
  return text;
}

async function answer({ question, chapter = 0, t = 0, pack = null, history = [] }) {
  const started = Date.now();
  const system = systemFor(chapter, t, pack);
  const errs = [];
  const forced = process.env.HF_TUTOR_FORCE_FALLBACK === '1';
  if (forced) errs.push('forced by HF_TUTOR_FORCE_FALLBACK');
  /* tier 1: primary OpenAI-compatible provider (e.g. Groq) */
  if (!forced && LLM_KEY && LLM_BASE) {
    try {
      return { mode: 'env-llm', model: LLM_MODEL,
               answer: await llmViaEnv(LLM_BASE, LLM_KEY, LLM_MODEL,
                                       system, history, question),
               elapsed_ms: Date.now() - started,
               ...(errs.length ? { errors: [...errs] } : {}) };
    } catch (e) { errs.push('env-llm: ' + (e && e.message || e)); }
  }
  /* tier 1b: second provider (e.g. Z.AI / Google / Mistral) — resilience when
     tier 1 is rate-limited, geo-blocked, or its model got retired */
  if (!forced && LLM2_KEY && LLM2_BASE && LLM2_MODEL) {
    try {
      return { mode: 'env-llm2', model: LLM2_MODEL,
               answer: await llmViaEnv(LLM2_BASE, LLM2_KEY, LLM2_MODEL,
                                       system, history, question),
               elapsed_ms: Date.now() - started,
               ...(errs.length ? { errors: [...errs] } : {}) };
    } catch (e) { errs.push('env-llm2: ' + (e && e.message || e)); }
  }
  /* tier 2: keyless SDK (only where a .z-ai-config exists, e.g. this sandbox) */
  if (!forced) {
    try {
      return { mode: 'sdk', answer: await llmViaSdk(system, history, question),
               elapsed_ms: Date.now() - started,
               ...(errs.length ? { errors: [...errs] } : {}) };
    } catch (e) { errs.push('sdk: ' + (e && e.message || e)); }
  }
  try {
    const fb = offlineAnswer(question, chapter, t, pack);
    fb.errors = errs;
    fb.elapsed_ms = Date.now() - started;
    return fb;
  } catch (e) {
    throw new Error('all tutor modes failed — ' + errs.join(' | '));
  }
}

export { systemFor, readJson, answer };
