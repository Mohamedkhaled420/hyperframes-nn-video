/* Shared tutor context for the serverless AI tutor (api/ask.mjs).
   Mirrors glm_server.mjs so answers never drift between the companion
   server and the Vercel deployment. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  try {
    const md = fs.readFileSync(path.join(ROOT, 'narration_script.md'), 'utf8');
    _narr = md.split(/^## /m).slice(1).map(s => '## ' + s.trim());
  } catch { _narr = []; }
  return _narr;
}

function sceneDocs() {
  if (_docs) return _docs;
  try {
    const dir = path.join(ROOT, 'scene_docs');
    _docs = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort()
      .map(f => fs.readFileSync(path.join(dir, f), 'utf8'));
  } catch { _docs = []; }
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

export { systemFor, readJson };
