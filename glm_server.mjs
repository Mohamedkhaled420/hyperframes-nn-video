#!/usr/bin/env bun
/**
 * glm_server.mjs — keyless GLM companion server for the
 * "How does a machine learn to read?" video player.
 *
 * What it does
 *   1. Serves the whole project folder as a static site (PLAYER.html at /).
 *   2. Exposes POST /api/ask — sends the viewer's question to GLM through
 *      z-ai-web-dev-sdk (NO API key needed — the SDK handles auth itself),
 *      with the current chapter's narration + scene notes as context.
 *
 * Run (from this folder):
 *      bun glm_server.mjs            # or: node glm_server.mjs
 * then open http://localhost:8787  → click "Ask AI" (or press A).
 *
 * Endpoints
 *   GET  /api/health  → { ok, chapters, model }
 *   POST /api/ask     → body { question, chapter (0-11), t (seconds in video),
 *                              history: [{role, content}, ... optional] }
 *                     → { answer, chapter, elapsed_ms }
 */
import ZAI from 'z-ai-web-dev-sdk';
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);

/* ------------------------------------------------------------ knowledge --
 * Chapter context comes straight from the project's own docs, so the tutor
 * always agrees with what is on screen.
 *   narration_script.md → per-chapter narration lines
 *   scene_docs/sNN.md   → per-chapter beats + implementation notes
 * ----------------------------------------------------------------------- */
const narration = await readFile(path.join(ROOT, 'narration_script.md'), 'utf8');
const narrChapters = narration.split(/^## /m).slice(1).map(sec =>
  '## ' + sec.trim());

const docFiles = (await readdir(path.join(ROOT, 'scene_docs'))).sort();
const sceneDocs = [];
for (const f of docFiles) {
  if (f.endsWith('.md')) sceneDocs.push(
    await readFile(path.join(ROOT, 'scene_docs', f), 'utf8'));
}
if (narrChapters.length !== 12 || sceneDocs.length < 12) {
  console.error(`warning: narration=${narrChapters.length} docs=${sceneDocs.length} (expected 12/12)`);
}

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

function systemFor(chapter, t) {
  const c = Math.max(0, Math.min(11, chapter | 0));
  const mmss = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  return `${SYSTEM_BASE}

THE VIEWER IS RIGHT NOW at ${mmss} of the video, watching chapter ${c + 1}/12.
Their question is most likely about this chapter — here is its narration:

${narrChapters[c] || '(no narration available)'}

AND HERE ARE ITS SCENE NOTES:

${sceneDocs[c] || '(no notes available)'}`;
}

/* ------------------------------------------------------------------- SDK --
 * Keyless: ZAI.create() picks up ambient credentials. One instance, reused.
 * ------------------------------------------------------------------------- */
let zai = null;
async function getZAI() {
  if (!zai) zai = await ZAI.create();
  return zai;
}

/* ---------------------------------------------------------------- static --
 * ----------------------------------------------------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.mjs': 'text/javascript; charset=utf-8',
  '.zip': 'application/zip', '.map': 'application/json',
};
function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/PLAYER.html';
  const fp = path.normalize(path.join(ROOT, urlPath));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  readFile(fp).then(buf => {
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  }).catch(() => { res.writeHead(404); res.end('not found'); });
}

/* ------------------------------------------------------------------ api --- */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > 64e3) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleAsk(req, res) {
  const started = Date.now();
  let body;
  try { body = JSON.parse(await readBody(req) || '{}'); }
  catch { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'invalid JSON body' })); }

  const question = String(body.question || '').trim();
  if (!question) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'question is required' }));
  }
  const chapter = Number.isFinite(+body.chapter) ? +body.chapter : 0;
  const t = Number.isFinite(+body.t) ? +body.t : 0;
  const history = Array.isArray(body.history)
    ? body.history.filter(m => m && typeof m.content === 'string'
        && (m.role === 'user' || m.role === 'assistant')).slice(-6)
    : [];

  try {
    const client = await getZAI();
    const messages = [
      { role: 'assistant', content: systemFor(chapter, t) },
      ...history,
      { role: 'user', content: question },
    ];
    const completion = await client.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
    });
    const answer = completion.choices?.[0]?.message?.content || '';
    if (!answer.trim()) throw new Error('empty response from model');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ answer, chapter, elapsed_ms: Date.now() - started }));
    console.log(`ask  ch${chapter + 1}  "${question.slice(0, 60)}" -> ${answer.length} chars in ${Date.now() - started}ms`);
  } catch (err) {
    console.error('ask failed:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'GLM request failed: ' + err.message }));
  }
}

/* ----------------------------------------------------------------- boot --- */
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/ask') return void handleAsk(req, res);
  if (req.method === 'GET' && req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, chapters: 12, model: 'glm (keyless via z-ai-web-dev-sdk)' }));
  }
  return void serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n  AI tutor ready — keyless GLM via z-ai-web-dev-sdk`);
  console.log(`  open  http://localhost:${PORT}  →  click "Ask AI" (or press A)\n`);
});
