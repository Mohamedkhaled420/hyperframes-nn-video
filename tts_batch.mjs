#!/usr/bin/env bun
/**
 * tts_batch.mjs — generate narration speech for every caption line of the
 * 12 scenes, via keyless z-ai-web-dev-sdk TTS.
 *
 * Lines come from each scene's embedded DATA.narr = [[start, dur, text], ...]
 * (the exact windows the burned-in captions use). If a clip overruns its
 * caption window it is regenerated faster (speed up to 1.4) to keep sync.
 *
 * Output: scripts/build/tts/<scene>/LNN.wav + manifest.json
 * Run:  cd download/hyperframes_nn_video && bun /home/z/my-project/scripts/tts_batch.mjs
 */
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project/download/hyperframes_nn_video';
const OUT = '/home/z/my-project/scripts/build/tts';
const VOICE = process.env.TTS_VOICE || 'jam';
const CONC = 1;                       // API rate-limits hard: stay serial

function wavDuration(buf) {                     // walk RIFF chunks
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

async function gen(zai, text, speed) {
  const r = await zai.audio.tts.create({
    input: text, voice: VOICE, speed, response_format: 'wav', stream: false,
  });
  return Buffer.from(new Uint8Array(await r.arrayBuffer()));
}

async function genRetry(zai, text, speed, tries = 20) {
  for (let a = 1; a <= tries; a++) {
    try {
      const buf = await gen(zai, text, speed);
      const d = wavDuration(buf);
      if (d > 0 && buf.length > 4000) return { buf, dur: d };
      throw new Error(`bad wav (dur=${d.toFixed(2)} len=${buf.length})`);
    } catch (e) {
      const is429 = /429|too many/i.test(e.message);
      if (a === tries) throw e;
      console.log(`    retry ${a} (${is429 ? 'rate-limited' : e.message.slice(0, 40)})`);
      await new Promise(r => setTimeout(r, is429 ? 30000 + 10000 * a : 1000 * a));
    }
  }
}

/* ---- collect lines ------------------------------------------------- */
const jobs = [];
for (const folder of fs.readdirSync(ROOT).filter(f => /^s\d\d_/.test(f)).sort()) {
  const html = fs.readFileSync(path.join(ROOT, folder, 'index.html'), 'utf8');
  const m = html.match(/const DATA = (\{.*?\});\n/s);
  if (!m) { console.error(`no DATA in ${folder}`); continue; }
  const narr = JSON.parse(m[1]).narr || [];
  narr.forEach(([start, win, text], i) =>
    jobs.push({ folder, idx: i, start, win, text }));
}
console.log(`lines: ${jobs.length}, voice: ${VOICE}`);

/* ---- generate with limited concurrency ------------------------------ */
const zai = await ZAI.create();
const results = new Array(jobs.length);
let cursor = 0, done = 0;

async function runner() {
  while (cursor < jobs.length) {
    const k = cursor++;
    const j = jobs[k];
    const dir = path.join(OUT, j.folder);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `L${String(j.idx).padStart(2, '0')}.wav`);
    try {
      /* resumable: keep a previously generated valid clip */
      if (fs.existsSync(file)) {
        const prev = fs.readFileSync(file);
        const pd = wavDuration(prev);
        if (pd > 0 && prev.length > 4000) {
          results[k] = { ...j, file, dur: +pd.toFixed(3), speed: -1 };
          done++; continue;
        }
      }
      let { buf, dur } = await genRetry(zai, j.text, 1.0);
      let speed = 1.0;
      const budget = j.win + 0.6;                       // small grace
      if (dur > budget && j.win >= 2) {
        speed = Math.min(1.4, Math.max(1.05, dur / budget));
        ({ buf, dur } = await genRetry(zai, j.text, speed));
      }
      fs.writeFileSync(file, buf);
      results[k] = { ...j, file, dur: +dur.toFixed(3), speed };
    } catch (e) {
      console.error(`FAIL ${j.folder}#${j.idx}: ${e.message}`);
      results[k] = { ...j, file: null, error: e.message };
    }
    done++;
    if (done % 10 === 0) console.log(`  ${done}/${jobs.length}`);
    await new Promise(r => setTimeout(r, 2500));   // gentle pacing
  }
}
await Promise.all(Array.from({ length: CONC }, runner));

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(results, null, 1));
const ok = results.filter(r => r.file).length;
const fast = results.filter(r => r.speed > 1.0).length;
console.log(`done: ${ok}/${jobs.length} clips (${fast} speed-fitted) -> ${OUT}`);
if (ok < jobs.length) process.exit(1);
