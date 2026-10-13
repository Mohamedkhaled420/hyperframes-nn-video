#!/usr/bin/env bun
/**
 * glm_server.mjs — keyless GLM studio server for the Hyperframes video player.
 *
 * 1. Serves the project (PLAYER.html at /) plus everything under generated/.
 * 2. POST /api/ask        — AI tutor, chapter-aware (keyless z-ai-web-dev-sdk).
 * 3. POST /api/generate   — GLM writes a whole NEW scenes folder from a prompt:
 *                           plan -> per-scene JS bodies -> assembled index.html
 *                           -> headless smoke test -> TTS narration -> pack.json
 * 4. POST /api/export     — renders any pack (bundled or generated) to MP4 with
 *                           studio/export_pack.py (Playwright frames + ffmpeg).
 * 5. GET  /api/packs|pack|job|download — pack library, job polling, downloads.
 *
 * Run:  bun glm_server.mjs        (PORT env to change, default 8787)
 */
import ZAI from 'z-ai-web-dev-sdk';
import http from 'node:http';
import fs, { createReadStream } from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const GEN = path.join(ROOT, 'generated');
const EXPORTS = path.join(ROOT, 'exports');
const STUDIO = path.join(ROOT, 'studio');
const VOICE = process.env.TTS_VOICE || 'jam';
for (const d of [GEN, EXPORTS]) fs.mkdirSync(d, { recursive: true });

/* ------------------------------------------------------------ knowledge -- */
const narration = await fsp.readFile(path.join(ROOT, 'narration_script.md'), 'utf8');
const narrChapters = narration.split(/^## /m).slice(1).map(s => '## ' + s.trim());
const docFiles = (await fsp.readdir(path.join(ROOT, 'scene_docs'))).sort();
const sceneDocs = [];
for (const f of docFiles) if (f.endsWith('.md'))
  sceneDocs.push(await fsp.readFile(path.join(ROOT, 'scene_docs', f), 'utf8'));

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

function systemFor(chapter, t, pack) {
  const mmss = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  if (pack && pack !== 'bundled') {
    const secs = packNarration(pack);
    return `${SYSTEM_GEN}

THE VIEWER IS at ${mmss}, chapter ${(chapter | 0) + 1} of the CURRENT video
("${pack}"). Here is its narration script for context:

${secs.join('\n\n') || '(no narration available)'}`;
  }
  const c = Math.max(0, Math.min(11, chapter | 0));
  return `${SYSTEM_BASE}

THE VIEWER IS RIGHT NOW at ${mmss} of the video, watching chapter ${c + 1}/12.
Their question is most likely about this chapter — here is its narration:

${narrChapters[c] || '(no narration available)'}

AND HERE ARE ITS SCENE NOTES:

${sceneDocs[c] || '(no notes available)'}`;
}

const packNarrCache = new Map();
function packNarration(slug) {
  if (packNarrCache.has(slug)) return packNarrCache.get(slug);
  let secs = [];
  try {
    const md = fs.readFileSync(path.join(GEN, slug, 'narration_script.md'), 'utf8');
    secs = md.split(/^## /m).slice(1).map(s => '## ' + s.trim());
  } catch {}
  packNarrCache.set(slug, secs);
  return secs;
}

/* ------------------------------------------------------------------ SDK -- */
let zai = null;
async function getZAI() {
  if (!zai) zai = await ZAI.create();
  return zai;
}
async function glm(messages) {
  const client = await getZAI();
  const completion = await client.chat.completions.create({
    messages, thinking: { type: 'disabled' },
  });
  const txt = completion.choices?.[0]?.message?.content || '';
  if (!txt.trim()) throw new Error('empty response from model');
  return txt;
}

/* --------------------------------------------------------- studio assets */
const ENGINE = await fsp.readFile(path.join(STUDIO, 'engine.js'), 'utf8');
const SHELL = await fsp.readFile(path.join(STUDIO, 'shell.html'), 'utf8');
const GUIDE = await fsp.readFile(path.join(STUDIO, 'scene_guide.md'), 'utf8');
const EXAMPLE = await fsp.readFile(path.join(STUDIO, 'example_scene.js'), 'utf8');

/* ================================================================= jobs == */
const jobs = new Map();
let jobSeq = 0, jobChain = Promise.resolve();

function startJob(type, fn) {
  const id = 'j' + (++jobSeq) + Date.now().toString(36);
  const job = {
    id, type, status: 'queued', phase: 'queued', progress: 0,
    logs: [], result: {}, created: Date.now(), ended: null,
  };
  jobs.set(id, job);
  job.log = (msg, pct, phase) => {
    job.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (job.logs.length > 240) job.logs.splice(0, job.logs.length - 240);
    if (pct != null) job.progress = Math.round(pct);
    if (phase) job.phase = phase;
    console.log(`[${id}] ${msg}`);
  };
  jobChain = jobChain
    .then(() => { job.status = 'running'; job.phase = 'running'; })
    .then(() => fn(job))
    .then(res => {
      Object.assign(job.result, res || {});
      job.status = 'done'; job.phase = 'done'; job.progress = 100;
      job.ended = Date.now();
      job.logs.push('JOB DONE');
    })
    .catch(err => {
      job.status = 'error'; job.phase = 'error'; job.ended = Date.now();
      job.error = String(err && err.message || err);
      job.logs.push('ERROR: ' + job.error);
      console.error(`[${id}] failed:`, job.error);
    });
  return job;
}

/* ============================================================ packs ====== */
const PALETTE = ['#58C4DD', '#5FD3BC', '#7EC96B', '#FFE45C', '#FF9F43',
                 '#FC6255', '#B57EDC', '#FFC53D'];

function slugify(s, max = 28) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, max) || 'video';
}
function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function bundledPayload() {
  const order = [];
  const csv = await fsp.readFile(path.join(ROOT, 'jobs.csv'), 'utf8');
  for (const row of csv.trim().split('\n').slice(1)) order.push(row.split(',')[0].trim());
  const scenes = [];
  let t0 = 0;
  for (const folder of order) {
    let html = await fsp.readFile(path.join(ROOT, folder, 'index.html'), 'utf8');
    const dur = parseFloat((html.match(/data-composition-duration="([0-9.]+)"/) || [])[1] || '0');
    const title = ((html.match(/<title>([^<]+)<\/title>/) || [])[1] || folder)
      .replace('Hyperframes · ', '').trim();
    const AUTO = "if (location.hash.indexOf('freeze') < 0){";
    if (html.includes(AUTO))
      html = html.replace(AUTO, 'if (false){ /* autoplay off: master player drives */');
    const start = t0; t0 += dur;
    scenes.push({ folder, title, short: folder.split('_')[1] || folder,
                  dur, start, end: t0, html });
  }
  return { slug: 'bundled', generated: false,
           title: 'How does a machine learn to read?',
           tagline: 'The bundled 11-minute neural-network explainer',
           total: t0, scenes };
}

async function generatedPayload(slug) {
  const meta = JSON.parse(await fsp.readFile(path.join(GEN, slug, 'pack.json'), 'utf8'));
  const scenes = [];
  let t0 = 0;
  for (const sc of meta.scenes) {
    let html = await fsp.readFile(path.join(GEN, slug, sc.folder, 'index.html'), 'utf8');
    const AUTO = "if (location.hash.indexOf('freeze') < 0){";
    if (html.includes(AUTO))
      html = html.replace(AUTO, 'if (false){ /* autoplay off: master player drives */');
    const start = t0; t0 += sc.dur;
    scenes.push({ folder: sc.folder, title: sc.chapter + ' — ' + sc.title,
                  short: sc.title, dur: sc.dur, start, end: t0, html });
  }
  return { slug, generated: true, title: meta.title, tagline: meta.tagline || '',
           total: t0, scenes };
}

let bundledCache = null, bundledCacheAt = 0;
async function packPayload(slug) {
  if (slug === 'bundled') {
    if (!bundledCache || Date.now() - bundledCacheAt > 30000) {
      bundledCache = await bundledPayload(); bundledCacheAt = Date.now();
    }
    return bundledCache;
  }
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('bad pack id');
  return generatedPayload(slug);
}

async function packsList() {
  const out = [];
  try {
    const b = await bundledPayload();
    out.push({ slug: 'bundled', title: b.title, tagline: b.tagline,
               chapters: b.scenes.length, total: b.total, generated: false });
  } catch {}
  const dirs = (await fsp.readdir(GEN).catch(() => [])).sort().reverse();
  for (const d of dirs) {
    try {
      const m = JSON.parse(await fsp.readFile(path.join(GEN, d, 'pack.json'), 'utf8'));
      out.push({ slug: d, title: m.title, tagline: m.tagline || '',
                 chapters: m.scenes.length, total: m.total,
                 generated: true, created: m.createdAt || null });
    } catch {}
  }
  return out;
}

/* ======================================================== generation ===== */
const PLAN_SYS = `You are the showrunner of short educational videos rendered by the
Hyperframes engine (dark navy SVG scenes, friendly explainer style). You plan a
video from a viewer's prompt. Output ONLY raw JSON — no markdown fences, no
commentary — matching exactly this schema:

{
 "title": "short catchy video title",
 "tagline": "one-line subtitle",
 "scenes": [
  { "name": "two-or-three-word-slug",
    "chapter": "Chapter 1",
    "title": "scene title shown on screen",
    "dur": 30,
    "accent": "#58C4DD",
    "narr": [[1.0, 4.5, "Spoken narration sentence one."], [6.0, 5.0, "..."]],
    "visual": "Beat-by-beat description of what is on screen and when, tied to the narr windows." }
 ]
}

HARD RULES FOR THE PLAN
- 2 to 6 scenes; each dur between 20 and 40 seconds.
- 5 to 8 narration lines per scene: start >= 1.0, window 3.0-6.5 s, >= 0.7 s gap
  between lines, last line ends at most dur - 1.5. Lines are one or two short
  spoken sentences, plain English, no markdown.
- accent must be one of: ${PALETTE.join(', ')}.
- One coherent story arc across scenes: hook first, build the idea step by step,
  end with a payoff or recap. Numbers used in narration must be consistent.
- Family-friendly, concrete, no hype.`;

const SCENE_SYS = () => `${GUIDE}

================ EXAMPLE OF A COMPLETE SCENE BODY ================
${EXAMPLE}
==================================================================
You write ONE scene body for the plan you are given. Output ONLY the JavaScript
body — no markdown fences, no explanations, no HTML. It must obey every rule in
the guide: one IIFE, only the documented helpers, deterministic, and it must end
with the three required calls (begin ... captions(DATA.narr) ... progressBar(...)).
Sync each visual beat to the narr window that talks about it. Leave the caption
band (y > 890) and the top-left chip area clear.`;

function extractJSON(txt) {
  let t = txt.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

function normalizePlan(plan, nScenes) {
  if (!plan || !Array.isArray(plan.scenes) || plan.scenes.length < 2)
    throw new Error('plan has no scenes');
  let scenes = plan.scenes.slice(0, nScenes || 6);
  scenes = scenes.map((s, i) => {
    const dur = Math.max(18, Math.min(42, Math.round(+s.dur || 30)));
    const accent = PALETTE.includes(s.accent) ? s.accent : PALETTE[i % PALETTE.length];
    const narr = (Array.isArray(s.narr) ? s.narr : [])
      .map(([t0, w, txt]) => [+t0, Math.max(2, Math.min(7, +w || 4)), String(txt || '').trim()])
      .filter(([t0, w, txt]) => txt && txt.length < 240 && t0 >= 0.5 && t0 + w <= dur)
      .sort((a, b) => a[0] - b[0]);
    if (narr.length < 2) throw new Error(`scene ${i + 1}: too few narration lines`);
    return { name: slugify(s.name || s.title || 'scene', 24),
             chapter: String(s.chapter || ('Chapter ' + (i + 1))).slice(0, 40),
             title: String(s.title || s.name || 'Scene').slice(0, 80),
             dur, accent, narr,
             visual: String(s.visual || '').slice(0, 1200) };
  });
  const title = String(plan.title || 'AI video').slice(0, 90);
  const tagline = String(plan.tagline || '').slice(0, 140);
  return { title, tagline, scenes };
}

function validateBody(code) {
  if (!code || code.length < 200) return 'body too short';
  if (code.length > 16000) return 'body too long';
  if (/```/.test(code)) return 'markdown fences not allowed';
  const bad = code.match(/Math\.random|Date\.now|setInterval|setTimeout|requestAnimationFrame|fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|eval\s*\(|new\s+Function|import\s|window\.open|addEventListener|WebSocket|Worker\s*\(|Audio\s*\(|Image\s*\(/);
  if (bad) return `forbidden API: ${bad[0]}`;
  for (const need of ['captions(', 'begin(', 'progressBar('])
    if (!code.includes(need)) return `missing required call: ${need}`;
  const redecl = code.match(/\b(?:const|let|var|function)\s+(?:el|G|T|stext|rect|circle|line|path|arrow|grid|heat|bars|fade|pop|wipe|out|to|draw|tween|sync|reg|lerp|lerpA|clamp|easeIO|easeOutC|easeBack|wrapText|captions|begin|progressBar|svg|DUR|C|OPS|SYNCS|STATES)\b/);
  if (redecl) return `redeclares an engine helper: ${redecl[0]} — rename your variable`;
  const bal = (o, c) => (code.split(o).length - 1) - (code.split(c).length - 1);
  if (bal('{', '}') !== 0) return 'unbalanced braces';
  if (bal('(', ')') !== 0) return 'unbalanced parentheses';
  try { new Function(code); } catch (e) {
    return 'syntax error: ' + String(e.message || e).slice(0, 160);
  }
  return null;
}

function fallbackBody(sc) {
  const A = JSON.stringify(sc.accent);   // quoted hex — a bare #literal is invalid JS
  const lines = sc.narr.slice(0, 6).map((n, i) =>
    `  { t: ${(+n[0]).toFixed(1)}, txt: ${JSON.stringify(n[2].slice(0, 60))} }`).join(',\n');
  return `(function(){
begin({ n: ${JSON.stringify(sc.chapter)}, title: ${JSON.stringify(sc.title)}, color: ${A} });
rect(120, 200, 1680, 560, { fill: C.panel, rx: 24 });
const tt = T(${JSON.stringify(sc.title)}, 960, 330, { size: 66, weight: '700', color: ${A} });
wipe(tt, 0.8, 1.2);
const items = [
${lines}
];
items.forEach((it, i) => {
  const row = T((i + 1) + '.  ' + it.txt, 220, 430 + i * 62,
                { size: 30, anchor: 'l', show: true, color: C.text });
  fade(row, it.t, 0.5, { y: 10 });
});
captions(DATA.narr);
progressBar(${A});
})();`;
}

function assemble(shell, dur, chapter, title, narr, body) {
  const data = JSON.stringify({ narr }).replace(/<\//g, '<\\/');
  return shell
    .split('/*__DATA__*/').join('const DATA = ' + data + ';')
    .split('/*__ENGINE__*/').join(ENGINE)
    .split('/*__SCENE__*/').join(body)
    .split('__TITLE__').join('Hyperframes · ' + chapter + ' — ' + title)
    .split('__DUR__').join(String(dur));
}

/* ---- TTS (keyless, voice jam) -------------------------------------------- */
function wavDuration(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return -1;
  let off = 12, fmt = null, data = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { byteRate: buf.readUInt32LE(off + 16) };
    if (id === 'data') { data = size; break; }
    off += 8 + size + (size % 2);
  }
  return fmt && data ? data / fmt.byteRate : -1;
}
async function ttsLine(zai, text, speed) {
  const r = await zai.audio.tts.create({
    input: text, voice: VOICE, speed, response_format: 'wav', stream: false,
  });
  return Buffer.from(new Uint8Array(await r.arrayBuffer()));
}
async function ttsLineFit(zai, text, budget) {
  let lastErr = null;
  const WAITS = [2000, 4000, 8000, 12000, 18000];
  for (let attempt = 1; attempt <= WAITS.length; attempt++) {
    try {
      const buf = await ttsLine(zai, text, 1.0);
      let dur = wavDuration(buf), speed = 1.0;
      if (dur > budget && budget >= 2) {
        speed = Math.min(1.4, Math.max(1.05, dur / budget));
        const buf2 = await ttsLine(zai, text, speed);
        const dur2 = wavDuration(buf2);
        if (dur2 > 0) { return { buf: buf2, dur: dur2, speed }; }
      }
      if (dur > 0 && buf.length >= 4000) return { buf, dur, speed };
      throw new Error(`bad wav (dur=${dur.toFixed ? dur.toFixed(2) : dur} len=${buf.length})`);
    } catch (e) {
      lastErr = e;
      const msg = String(e.message || e);
      const wait = /429|Too many|quota|timeout|ECONN|socket/i.test(msg)
        ? WAITS[attempt - 1] : 800;
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr || new Error('tts failed');
}

/* ---- the generate job ---------------------------------------------------- */
async function runGenerate(job, { prompt, scenes: nScenes }) {
  const slug = slugify(prompt.split(/\s+/).slice(0, 3).join(' ')) + '-' + stamp();
  const dir = path.join(GEN, slug);
  await fsp.mkdir(dir, { recursive: true });
  const meta = { slug, title: '', tagline: '', total: 0, createdAt: new Date().toISOString(),
                 voice: VOICE, scenes: [], smoke: {}, tts: { ok: 0, total: 0 } };
  job.result.slug = slug;

  /* 1 — plan */
  job.log('planning the video with GLM…', 2, 'plan');
  let plan = null;
  for (let attempt = 1; attempt <= 2 && !plan; attempt++) {
    try {
      const txt = await glm([
        { role: 'assistant', content: PLAN_SYS },
        { role: 'user', content: `Viewer prompt: "${prompt}"\nMake a plan with exactly ${nScenes} scenes.` },
      ]);
      plan = normalizePlan(extractJSON(txt), nScenes);
    } catch (e) {
      job.log(`plan attempt ${attempt} failed: ${e.message}`);
      if (attempt === 2) throw new Error('could not get a valid plan: ' + e.message);
    }
  }
  meta.title = plan.title; meta.tagline = plan.tagline;
  job.log(`plan ok: "${plan.title}" — ${plan.scenes.length} scenes, ` +
          `${plan.scenes.reduce((a, s) => a + s.dur, 0)}s total`, 8, 'scenes');

  /* 2 — scene bodies */
  const sceneBodies = [];
  for (let i = 0; i < plan.scenes.length; i++) {
    const sc = plan.scenes[i];
    const pct = 8 + (i / plan.scenes.length) * 44;
    job.log(`writing scene ${i + 1}/${plan.scenes.length}: ${sc.title}…`, pct, 'scenes');
    const user = `Video plan (JSON):\n${JSON.stringify({ title: plan.title, scenes: plan.scenes })}\n\n` +
      `Write the SCENE BODY for scene ${i + 1}: "${sc.chapter} — ${sc.title}" ` +
      `(dur ${sc.dur}s, accent ${sc.accent}). Its DATA.narr is: ${JSON.stringify(sc.narr)}\n` +
      `Visual beats: ${sc.visual || '(you decide, following the narration)'}`;
    let body = null, err = null;
    for (let attempt = 1; attempt <= 2 && !body; attempt++) {
      try {
        const code = await glm([
          { role: 'assistant', content: SCENE_SYS() },
          { role: 'user', content: attempt === 1 ? user : user +
              `\n\nYour previous attempt was rejected: ${err}. Fix it and output the full body again.` },
        ]);
        const clean = code.trim().replace(/^```(?:javascript|js)?/i, '').replace(/```$/, '').trim();
        err = validateBody(clean);
        if (err) { job.log(`scene ${i + 1} attempt ${attempt}: ${err}`); continue; }
        body = clean;
      } catch (e) { err = e.message; job.log(`scene ${i + 1} attempt ${attempt}: ${e.message}`); }
    }
    if (!body) {
      job.log(`scene ${i + 1}: using built-in fallback layout`);
      body = fallbackBody(sc);
    }
    sceneBodies.push({ sc, body });
  }

  /* 3 — assemble + write */
  job.log('assembling scene folders…', 55, 'assemble');
  for (let i = 0; i < sceneBodies.length; i++) {
    const { sc, body } = sceneBodies[i];
    const folder = 's' + String(i + 1).padStart(2, '0') + '_' + sc.name;
    const html = assemble(SHELL, sc.dur, sc.chapter, sc.title, sc.narr, body);
    await fsp.mkdir(path.join(dir, folder), { recursive: true });
    await fsp.writeFile(path.join(dir, folder, 'index.html'), html);
    meta.scenes.push({ folder, chapter: sc.chapter, title: sc.title,
                       short: sc.title, dur: sc.dur, accent: sc.accent });
  }
  meta.total = meta.scenes.reduce((a, s) => a + s.dur, 0);

  /* jobs.csv + narration_script.md (batch-renderer compatible) */
  const jobsRows = ['folder,html,output_name,enabled,overwrite,fps,quality,resolution,format,gpu,browser_gpu,workers,extra_args,var_captions'];
  const narrMd = [`# Narration script — "${meta.title}"`, '',
    `AI-generated pack (${meta.scenes.length} scenes, ${meta.total}s). Times are seconds within each scene.`, ''];
  for (const sc of plan.scenes) {
    const folder = meta.scenes.find(m => m.title === sc.title).folder;
    jobsRows.push([folder, '', folder, 'yes', 'no', '30', 'looks', 'landscape',
                   'mp4', 'yes', 'yes', 'auto', '', 'true'].join(','));
    narrMd.push(`## ${sc.chapter} — ${sc.title} (${sc.dur}s)`, '');
    for (const [t0, w, txt] of sc.narr)
      narrMd.push(`- \`[${t0.toFixed(1).padStart(6)} → ${(t0 + w).toFixed(1).padStart(6)}]\`  ${txt}`);
    narrMd.push('');
  }
  await fsp.writeFile(path.join(dir, 'jobs.csv'), jobsRows.join('\n') + '\n');
  await fsp.writeFile(path.join(dir, 'narration_script.md'), narrMd.join('\n'));
  packNarrCache.delete(slug);

  /* 4 — smoke test */
  job.log('smoke-testing scenes in headless Chromium…', 60, 'smoke');
  const smokeOut = path.join(EXPORTS, `smoke_${slug}.json`);
  const folders = meta.scenes.map(s => s.folder);
  await new Promise((resolve) => {
    const p = spawn('python3', [path.join(STUDIO, 'smoke_scene.py'),
      '--root', dir, '--out', smokeOut, ...folders], { cwd: ROOT });
    let buf = '';
    p.stdout.on('data', d => buf += d);
    p.on('close', resolve);
    setTimeout(resolve, 90000);
  });
  try {
    const res = JSON.parse(await fsp.readFile(smokeOut, 'utf8'));
    for (const r of res.results) {
      meta.smoke[r.folder] = { verdict: r.verdict, errors: r.errors };
      job.log(`smoke ${r.folder}: ${r.verdict}${r.errors.length ? ' — ' + r.errors[0] : ''}`);
    }
  } catch { job.log('smoke results unreadable (continuing)'); }

  /* 4b — repair pass: regenerate scenes whose smoke test flagged problems */
  const planFor = folder => plan.scenes[meta.scenes.findIndex(m => m.folder === folder)];
  const broken = meta.scenes.filter(s => {
    const v = meta.smoke[s.folder];
    return v && (v.verdict === 'fail' || (v.verdict === 'warn' && v.errors.length));
  }).map(s => s.folder);
  for (const folder of broken) {
    const i = meta.scenes.findIndex(m => m.folder === folder);
    const sc = planFor(folder);
    job.log(`repairing ${folder}…`, 62, 'repair');
    const user = `Video plan (JSON):\n${JSON.stringify({ title: plan.title, scenes: plan.scenes })}\n\n` +
      `Write the SCENE BODY for scene ${i + 1}: "${sc.chapter} — ${sc.title}" ` +
      `(dur ${sc.dur}s, accent ${sc.accent}). Its DATA.narr is: ${JSON.stringify(sc.narr)}\n` +
      `Visual beats: ${sc.visual || '(you decide, following the narration)'}`;
    let body = null, err = null;
    for (let attempt = 1; attempt <= 2 && !body; attempt++) {
      try {
        const code = await glm([
          { role: 'assistant', content: SCENE_SYS() },
          { role: 'user', content: user +
              `\n\nIMPORTANT: your previous scene body for THIS scene failed validation with: ` +
              `${JSON.stringify(meta.smoke[folder].errors)}. Fix those problems and output the full corrected body.` },
        ]);
        const clean = code.trim().replace(/^```(?:javascript|js)?/i, '').replace(/```$/, '').trim();
        err = validateBody(clean);
        if (err) { job.log(`repair ${folder} attempt ${attempt}: ${err}`); continue; }
        body = clean;
      } catch (e) { err = e.message; }
    }
    if (body) {
      await fsp.writeFile(path.join(dir, folder, 'index.html'),
        assemble(SHELL, sc.dur, sc.chapter, sc.title, sc.narr, body));
      const oneOut = path.join(EXPORTS, `smoke_${slug}_fix.json`);
      await new Promise((resolve) => {
        const p = spawn('python3', [path.join(STUDIO, 'smoke_scene.py'),
          '--root', dir, '--out', oneOut, folder], { cwd: ROOT });
        p.on('close', resolve);
        setTimeout(resolve, 60000);
      });
      try {
        const res2 = JSON.parse(await fsp.readFile(oneOut, 'utf8'));
        const r2 = res2.results[0];
        meta.smoke[folder] = { verdict: r2.verdict, errors: r2.errors };
        job.log(`repair ${folder}: now ${r2.verdict}`);
      } catch {}
    } else {
      job.log(`repair ${folder}: still rejected (${err}) — keeping fallback`);
      await fsp.writeFile(path.join(dir, folder, 'index.html'),
        assemble(SHELL, sc.dur, sc.chapter, sc.title, sc.narr, fallbackBody(sc)));
    }
  }

  /* 5 — TTS narration */
  job.log('generating narration speech (keyless TTS)…', 66, 'tts');
  const zai = await getZAI();
  const lines = [];
  for (const sc of plan.scenes) {
    const folder = meta.scenes.find(m => m.title === sc.title).folder;
    sc.narr.forEach(([t0, w, txt], i) =>
      lines.push({ folder, idx: i, t0, win: w, txt }));
  }
  meta.tts.total = lines.length;
  let done = 0;
  const ttsDir = path.join(dir, 'tts');
  let cursor = 0;
  async function ttsRunner() {
    while (cursor < lines.length) {
      const k = cursor++;
      const L = lines[k];
      const d = path.join(ttsDir, L.folder);
      await fsp.mkdir(d, { recursive: true });
      const file = path.join(d, `L${String(L.idx).padStart(2, '0')}.wav`);
      try {
        const { buf } = await ttsLineFit(zai, L.txt, L.win + 1.2);
        await fsp.writeFile(file, buf);
        meta.tts.ok++;
      } catch (e) {
        job.log(`tts miss ${L.folder}#${L.idx}: ${e.message}`);
      }
      done++;
      if (done % 4 === 0 || done === lines.length)
        job.log(`tts ${done}/${lines.length}`, 66 + 28 * done / lines.length, 'tts');
      await new Promise(r => setTimeout(r, 600));   // pace: dodge rate limits
    }
  }
  await Promise.all(Array.from({ length: 1 }, ttsRunner));

  /* 6 — manifest */
  await fsp.writeFile(path.join(dir, 'pack.json'), JSON.stringify(meta, null, 1));
  job.log(`pack ready: "${meta.title}" (${meta.scenes.length} scenes, ` +
          `${meta.tts.ok}/${meta.tts.total} voice clips)`, 98, 'finalize');
  return { slug, title: meta.title, scenes: meta.scenes.length, total: meta.total,
           tts: `${meta.tts.ok}/${meta.tts.total}` };
}

/* ============================================================ export ===== */
async function runExport(job, { pack }) {
  const payload = await packPayload(pack);
  const slug = payload.slug;
  const isBundled = slug === 'bundled';

  if (isBundled) {
    const master = path.join(ROOT, 'render', 'how_machines_learn_to_read_720p.mp4');
    try {
      const st = await fsp.stat(master);
      job.log('bundled video already has a rendered master — delivering it', 90, 'done');
      return { file: master, size: st.size, url: `/api/download/${job.id}`,
               filename: 'how_machines_learn_to_read_720p.mp4', instant: true };
    } catch {}
  }

  const root = isBundled ? ROOT : path.join(GEN, slug);
  const outfile = path.join(EXPORTS, `${slug}-${stamp()}.mp4`);
  const statusFile = path.join(EXPORTS, `${job.id}.status.json`);
  const args = ['--root', root, '--out', outfile, '--status', statusFile,
                '--fps', '30', '--work', path.join(EXPORTS, 'work_' + job.id)];
  if (!isBundled) args.push('--audio-lines-root', path.join(root, 'tts'));
  const frames = payload.scenes.reduce((a, s) => a + Math.round(s.dur * 30), 0);
  job.log(`exporting "${payload.title}": ${payload.scenes.length} scenes, ` +
          `~${frames} frames @30fps`, 1, 'render');

  await new Promise((resolve, reject) => {
    const p = spawn('python3', [path.join(STUDIO, 'export_pack.py'), ...args], { cwd: ROOT });
    let buf = '';
    const poll = setInterval(async () => {
      try {
        const st = JSON.parse(await fsp.readFile(statusFile, 'utf8'));
        job.phase = 'export:' + st.phase;
        job.progress = Math.max(1, Math.min(98, Math.round(st.pct)));
        if (st.scene) job.log(`${st.phase} ${st.scene} (${st.frames_done}/${st.frames_total} frames)`);
      } catch {}
    }, 2000);
    p.stdout.on('data', d => { buf += d; if (buf.length > 8000) buf = buf.slice(-4000); });
    p.stderr.on('data', d => { const s = String(d); if (s.trim()) job.log('py: ' + s.trim().split('\n').pop()); });
    p.on('close', code => {
      clearInterval(poll);
      fsp.unlink(statusFile).catch(() => {});
      if (code === 0) resolve();
      else reject(new Error(`export_pack.py exited ${code}; ${buf.slice(-400)}`));
    });
  });

  const st = await fsp.stat(outfile);
  if (st.size < 10000) throw new Error('export produced a suspiciously small file');
  job.log(`encoded ${(st.size / 1e6).toFixed(1)} MB`, 99, 'finalize');
  return { file: outfile, size: st.size, url: `/api/download/${job.id}`,
           filename: payload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '.mp4' };
}

/* ============================================================== static === */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mjs': 'text/javascript; charset=utf-8', '.zip': 'application/zip',
  '.map': 'application/json', '.wav': 'audio/wav', '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
};
function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/PLAYER.html';
  const fp = path.normalize(path.join(ROOT, urlPath));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fsp.readFile(fp).then(buf => {
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  }).catch(() => { res.writeHead(404); res.end('not found'); });
}

/* ================================================================= api === */
function readBody(req, limit = 200e3) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > limit) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

async function handleAsk(req, res) {
  const started = Date.now();
  let body;
  try { body = JSON.parse(await readBody(req) || '{}'); }
  catch { return json(res, 400, { error: 'invalid JSON body' }); }
  const question = String(body.question || '').trim();
  if (!question) return json(res, 400, { error: 'question is required' });
  const chapter = Number.isFinite(+body.chapter) ? +body.chapter : 0;
  const t = Number.isFinite(+body.t) ? +body.t : 0;
  const pack = body.pack && /^[a-z0-9-]{1,64}$/.test(body.pack) ? body.pack : null;
  const history = Array.isArray(body.history)
    ? body.history.filter(m => m && typeof m.content === 'string'
        && (m.role === 'user' || m.role === 'assistant')).slice(-6)
    : [];
  try {
    const answer = await glm([
      { role: 'assistant', content: systemFor(chapter, t, pack) },
      ...history,
      { role: 'user', content: question },
    ]);
    json(res, 200, { answer, chapter, elapsed_ms: Date.now() - started });
    console.log(`ask  ch${chapter + 1}  "${question.slice(0, 60)}" -> ${answer.length} chars`);
  } catch (err) {
    console.error('ask failed:', err.message);
    json(res, 502, { error: 'GLM request failed: ' + err.message });
  }
}

function serveDownload(req, res, jobId) {
  const job = jobs.get(jobId);
  const file = job && job.result && job.result.file;
  if (job && file && fs.existsSync(file)) {
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': fs.statSync(file).size,
      'Content-Disposition': `attachment; filename="${job.result.filename || 'video.mp4'}"`,
    });
    return createReadStream(file).pipe(res);
  }
  res.writeHead(404); res.end('not found');
}

/* ================================================================= boot == */
const server = http.createServer((req, res) => {
  const u = (req.url || '/').split('?')[0];
  if (req.method === 'POST' && u === '/api/ask') return void handleAsk(req, res);

  if (req.method === 'POST' && u === '/api/generate') {
    (async () => {
      const body = JSON.parse(await readBody(req) || '{}');
      const prompt = String(body.prompt || '').trim();
      const nScenes = Math.max(2, Math.min(6, +body.scenes || 4));
      if (prompt.length < 5) return json(res, 400, { error: 'prompt is too short' });
      if (prompt.length > 600) return json(res, 400, { error: 'prompt is too long (max 600 chars)' });
      const job = startJob('generate', j => runGenerate(j, { prompt, scenes: nScenes }));
      json(res, 200, { jobId: job.id });
    })().catch(e => json(res, 400, { error: e.message }));
    return;
  }
  if (req.method === 'POST' && u === '/api/export') {
    (async () => {
      const body = JSON.parse(await readBody(req) || '{}');
      const pack = String(body.pack || 'bundled');
      if (pack !== 'bundled' && !/^[a-z0-9-]{1,64}$/.test(pack))
        return json(res, 400, { error: 'bad pack id' });
      if (pack !== 'bundled' && !fs.existsSync(path.join(GEN, pack, 'pack.json')))
        return json(res, 404, { error: 'unknown pack' });
      const job = startJob('export', j => runExport(j, { pack }));
      json(res, 200, { jobId: job.id });
    })().catch(e => json(res, 400, { error: e.message }));
    return;
  }
  if (req.method === 'GET' && u.startsWith('/api/job/')) {
    const job = jobs.get(u.slice('/api/job/'.length));
    if (!job) return json(res, 404, { error: 'no such job' });
    return json(res, 200, { id: job.id, type: job.type, status: job.status,
      phase: job.phase, progress: job.progress, log: job.logs.slice(-24),
      result: job.result, error: job.error || null });
  }
  if (req.method === 'GET' && u.startsWith('/api/download/'))
    return void serveDownload(req, res, u.slice('/api/download/'.length));
  if (req.method === 'GET' && u === '/api/packs')
    return void packsList().then(l => json(res, 200, { packs: l }));
  if (req.method === 'GET' && u.startsWith('/api/pack/'))
    return void packPayload(u.slice('/api/pack/'.length)).then(p => json(res, 200, p))
      .catch(e => json(res, 404, { error: e.message }));

  if (req.method === 'GET' && u === '/api/health') {
    const packs = fs.readdirSync(GEN).filter(d => fs.existsSync(path.join(GEN, d, 'pack.json')));
    return json(res, 200, { ok: true, chapters: 12, packs: packs.length,
      model: 'glm (keyless via z-ai-web-dev-sdk)',
      features: ['tutor', 'generate', 'export'] });
  }
  return void serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n  Hyperframes Studio ready — keyless GLM via z-ai-web-dev-sdk`);
  console.log(`  open  http://localhost:${PORT}`);
  console.log(`  features: Ask AI tutor · AI Studio (generate scene packs) · Export MP4\n`);
});
