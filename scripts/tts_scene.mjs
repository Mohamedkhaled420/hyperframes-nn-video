#!/usr/bin/env bun
/**
 * tts_scene.mjs — fallback narration generator: ONE TTS clip per scene
 * (its full caption text joined), for scenes that lack per-line clips.
 * Resumable, very patient with rate limits (long backoffs).
 * Output: scripts/build/tts_scene/<folder>.wav + tts_scene/manifest.json
 */
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'node:fs';
import path from 'node:path';
import re2 from 'node:buffer';

const ROOT = '/home/z/my-project/download/hyperframes_nn_video';
const OUT = '/home/z/my-project/scripts/build/tts_scene';
fs.mkdirSync(OUT, { recursive: true });
const VOICE = process.env.TTS_VOICE || 'jam';

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

/* scenes needing a scene-level clip */
const scenes = [];
for (const folder of fs.readdirSync(ROOT).filter(f => /^s\d\d_/.test(f)).sort()) {
  const html = fs.readFileSync(path.join(ROOT, folder, 'index.html'), 'utf8');
  const m = html.match(/const DATA = (\{.*?\});\n/s);
  if (!m) continue;
  const narr = JSON.parse(m[1]).narr || [];
  const perLineComplete = narr.every((_, i) => {
    const p = path.join('/home/z/my-project/scripts/build/tts', folder,
      `L${String(i).padStart(2, '0')}.wav`);
    try { return fs.statSync(p).size > 4000; } catch { return false; }
  });
  if (!perLineComplete && narr.length)
    scenes.push({ folder, startAt: narr[0][0], spanEnd: narr.at(-1)[0] + narr.at(-1)[1],
                  text: narr.map(l => l[2]).join(' ') });
}
console.log(`scenes needing scene-level narration: ${scenes.map(s => s.folder).join(', ')}`);

const zai = await ZAI.create();
const manifest = fs.existsSync(path.join(OUT, 'manifest.json'))
  ? JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'))) : {};

async function genRetry(text, tries = 40) {
  for (let a = 1; a <= tries; a++) {
    try {
      const r = await zai.audio.tts.create({
        input: text, voice: VOICE, speed: 1.0, response_format: 'wav', stream: false });
      const buf = Buffer.from(new Uint8Array(await r.arrayBuffer()));
      const d = wavDuration(buf);
      if (d > 0 && buf.length > 4000) return { buf, dur: d };
      throw new Error('bad wav');
    } catch (e) {
      const is429 = /429|too many/i.test(e.message);
      if (a === tries) throw e;
      console.log(`    retry ${a} (${is429 ? '429' : e.message.slice(0, 30)})`);
      await new Promise(r => setTimeout(r, is429 ? 45000 + 5000 * Math.min(a, 6) : 1500));
    }
  }
}

for (const s of scenes) {
  const file = path.join(OUT, `${s.folder}.wav`);
  if (fs.existsSync(file) && wavDuration(fs.readFileSync(file)) > 0) {
    manifest[s.folder] = { file, dur: +wavDuration(fs.readFileSync(file)).toFixed(3),
      startAt: s.startAt, spanEnd: s.spanEnd };
    console.log(`${s.folder}: exists, skipped`);
    continue;
  }
  if (s.text.length > 1024) { console.error(`${s.folder}: text too long (${s.text.length})`); continue; }
  process.stdout.write(`${s.folder}: requesting (${s.text.length} chars)... `);
  try {
    const { buf, dur } = await genRetry(s.text);
    fs.writeFileSync(file, buf);
    manifest[s.folder] = { file, dur: +dur.toFixed(3), startAt: s.startAt, spanEnd: s.spanEnd };
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
    console.log(`${dur.toFixed(1)}s  (span ${s.spanEnd - s.startAt}s)`);
  } catch (e) {
    console.log(`FAILED: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 3000));
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
const ok = Object.keys(manifest).length;
console.log(`scene clips done: ${ok}/${scenes.length}`);
if (ok < scenes.length) process.exit(1);
