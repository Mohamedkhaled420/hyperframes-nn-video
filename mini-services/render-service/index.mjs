/* index.mjs — render-service: long-running pipeline companion.
   Endpoints (via gateway: /<path>?XTransformPort=3030):
   GET  /health
   POST /tts/prepare   {video:'nn-video'|packId, chapter?}   → jobId
   POST /export        {video, chapter?, fps?}               → jobId  (MP4 with narration audio)
   POST /generate      {prompt, chapters?}                   → jobId
   GET  /job/:id       status JSON
   GET  /job/:id/stream  SSE progress                                   */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { prepareVideoAudio } from './lib/tts.mjs';
import { exportVideo } from './lib/export.mjs';
import { generatePack } from './lib/generate.mjs';

const PORT = process.env.PORT || 3030;
const PUBLIC_DIR = process.env.PUBLIC_DIR || '/home/z/my-project/public';

const jobs = new Map(); // id → {id, kind, status, steps:[], pct, error, result, listeners:Set}
const jobSeq = { n: 0 };

function newJob(kind) {
  const id = 'job_' + (++jobSeq.n) + '_' + Date.now().toString(36);
  const job = { id, kind, status: 'running', steps: [], pct: 0, error: null, result: null, created: Date.now(), listeners: new Set() };
  jobs.set(id, job);
  return job;
}
function emit(job, ev) {
  for (const res of job.listeners) { try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch {} }
}
function log(job, msg) {
  job.steps.push({ t: Date.now(), msg });
  if (job.steps.length > 300) job.steps.splice(0, job.steps.length - 300);
  emit(job, { type: 'log', msg });
}
function progress(job, pct) { job.pct = Math.round(pct); emit(job, { type: 'progress', pct: job.pct }); }
function finish(job, result) { job.status = 'done'; job.result = result; progress(job, 100); emit(job, { type: 'done', result }); }
function fail(job, e) {
  job.status = 'failed'; job.error = String(e.message || e).slice(0, 1200);
  if (e.failed) job.failedLines = e.failed;
  emit(job, { type: 'error', error: job.error });
  console.error('[job failed]', job.error);
}

function videoDir(name) {
  for (const base of ['videos', 'generated']) {
    const p = path.join(PUBLIC_DIR, base, name);
    if (fs.existsSync(path.join(p, 'manifest.json'))) return p;
  }
  return null;
}

function readBody(req) {
  return new Promise((res, rej) => {
    let b = ''; req.on('data', c => { b += c; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => { try { res(b ? JSON.parse(b) : {}); } catch (e) { rej(e); } });
    req.on('error', rej);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (p === '/health') { res.writeHead(200); return res.end(JSON.stringify({ ok: true, deepgram: !!process.env.DEEPGRAM_API_KEY })); }

  /* SSE stream */
  const sse = p.match(/^\/job\/([\w-]+)\/stream$/);
  if (sse) {
    const job = jobs.get(sse[1]);
    if (!job) { res.writeHead(404); return res.end('no job'); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify({ type: 'hello', pct: job.pct, status: job.status, steps: job.steps.slice(-30).map(s => s.msg), error: job.error, result: job.result })}\n\n`);
    job.listeners.add(res);
    const iv = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 15000);
    req.on('close', () => { clearInterval(iv); job.listeners.delete(res); });
    return;
  }
  const jst = p.match(/^\/job\/([\w-]+)$/);
  if (jst) {
    const job = jobs.get(jst[1]);
    if (!job) { res.writeHead(404); return res.end('{}'); }
    res.writeHead(200); return res.end(JSON.stringify({ id: job.id, status: job.status, pct: job.pct, steps: job.steps.map(s => s.msg), error: job.error, result: job.result }));
  }

  if (req.method === 'POST' && p === '/tts/prepare') {
    const body = await readBody(req);
    const dir = videoDir(body.video);
    if (!dir) { res.writeHead(404); return res.end(JSON.stringify({ error: 'unknown video' })); }
    const job = newJob('tts');
    res.writeHead(200); res.end(JSON.stringify({ jobId: job.id }));
    (async () => {
      try {
        log(job, `preparing narration for ${body.video}${body.chapter ? ' · ' + body.chapter : ''} (provider: ${process.env.DEEPGRAM_API_KEY ? 'deepgram' : 'z-ai'})`);
        const r = await prepareVideoAudio(dir, {
          chapterId: body.chapter,
          voice: body.voice,
          log: m => log(job, m),
          onProgress: (d, t) => { progress(job, 5 + 90 * d / Math.max(1, t)); if (d % 10 === 0 || d === t) log(job, `narration ${d}/${t} lines`); }
        });
        finish(job, r);
      } catch (e) { fail(job, e); }
    })();
    return;
  }

  if (req.method === 'POST' && p === '/export') {
    const body = await readBody(req);
    const dir = videoDir(body.video);
    if (!dir) { res.writeHead(404); return res.end(JSON.stringify({ error: 'unknown video' })); }
    const job = newJob('export');
    res.writeHead(200); res.end(JSON.stringify({ jobId: job.id }));
    (async () => {
      try {
        const mf = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
        const chId = body.chapter && mf.chapters.some(c => c.id === body.chapter) ? body.chapter
          : (body.chapter === null ? null : mf.chapters[0].id);
        log(job, `exporting ${chId || 'FULL VIDEO'} @ ${body.fps || 30}fps (crf 18, narration audio muxed)`);
        const r = await exportVideo({
          videoDir: dir, videoId: body.video, chapterId: chId, fps: body.fps || 30,
          log: m => log(job, m),
          onProgress: (f, t, eta) => {
            progress(job, 3 + 95 * f / Math.max(1, t));
            if (f % (30 * 10) === 0) log(job, `frames ${f}/${t} — eta ${Math.round(eta)}s`);
          }
        });
        if (!r.ok && r.qc.issues.includes('NO AUDIO STREAM')) throw new Error('export QC failed: no audio in MP4');
        finish(job, r);
      } catch (e) { fail(job, e); }
    })();
    return;
  }

  if (req.method === 'POST' && p === '/generate') {
    const body = await readBody(req);
    if (!body.prompt || String(body.prompt).trim().length < 4) { res.writeHead(400); return res.end(JSON.stringify({ error: 'prompt required' })); }
    const job = newJob('generate');
    res.writeHead(200); res.end(JSON.stringify({ jobId: job.id }));
    (async () => {
      try {
        const r = await generatePack({
          prompt: String(body.prompt).slice(0, 600),
          chapters: Math.max(1, Math.min(6, body.chapters || 3)),
          log: m => log(job, m),
          onProgress: (stage, pct) => { progress(job, pct); emit(job, { type: 'stage', stage }); }
        });
        finish(job, r);
      } catch (e) { fail(job, e); }
    })();
    return;
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => console.log(`render-service on :${PORT} (deepgram: ${!!process.env.DEEPGRAM_API_KEY})`));
