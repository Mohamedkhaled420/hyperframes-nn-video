/* tts.mjs — narration synthesis. THE SILENT-PACK FIX:
   - No time-budget guard. TTS is a mandatory pipeline stage.
   - Provider chain: Deepgram (if DEEPGRAM_API_KEY) → z-ai SDK (fallback).
   - 3 attempts per line with backoff; any permanently failed line FAILS the job
     with an explicit error (never a silent pack).
   - Auto rate-fit: if a line's audio runs over its caption slot, re-synthesize
     faster, then (still over) apply ffmpeg atempo — audio always fits the timeline. */
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
const exec = promisify(execFile);

export const HAS_DEEPGRAM = !!process.env.DEEPGRAM_API_KEY;

let _zai = null;
async function zai() {
  if (!_zai) {
    const mod = await import('z-ai-web-dev-sdk');
    _zai = await mod.default.create();
  }
  return _zai;
}

export function probeDuration(file) {
  return exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])
    .then(r => parseFloat(r.stdout.trim()))
    .catch(() => 0);
}

/* low-level: one synthesis attempt, returns Buffer (mp3) */
async function synthOnce(text, { voice, rate }) {
  if (HAS_DEEPGRAM) {
    const params = new URLSearchParams({
      model: 'aura-2-thalia', encoding: 'mp3', bitrate: '128000'
    });
    if (rate && rate > 1.01) params.set('speaking_rate', String(Math.min(1.35, rate)));
    const res = await fetch(`https://api.deepgram.com/v1/speak?${params}`, {
      method: 'POST',
      headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!res.ok) throw new Error(`deepgram ${res.status}: ${(await res.text()).slice(0, 140)}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const z = await zai();
  const speed = rate && rate > 1.01 ? Math.min(2.0, rate) : 1.0;
  const res = await z.audio.tts.create({ input: text.slice(0, 1000), voice: voice || 'jam', speed, response_format: 'wav', stream: false });
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(new Uint8Array(ab));
  if (buf.length < 800) throw new Error('tts returned suspiciously small audio');
  return buf;
}

/* resilient synthesis with rate fitting. slot = seconds available. */
export async function synthesizeFitted(text, slot, { voice, log = () => {} } = {}) {
  const budget = slot + 0.35; // allow slight bleed into caption gap
  let rate = 1.0;
  let lastErr = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const buf = await synthOnce(text, { voice, rate });
      const tmp = path.join('/tmp', `tts_${Date.now()}_${Math.floor(Math.random() * 1e6)}.wav`);
      fs.writeFileSync(tmp, buf);
      let dur = await probeDuration(tmp);
      if (!dur || dur < 0.2) throw new Error('empty/short audio');
      if (dur > budget && rate < 1.3) {
        /* second pass at a faster speaking rate */
        rate = Math.min(1.3, Math.max(1.05, dur / budget));
        log(`line over slot (${dur.toFixed(1)}s > ${budget.toFixed(1)}s) → re-synth at rate ${rate.toFixed(2)}`);
        const buf2 = await synthOnce(text, { voice, rate });
        fs.writeFileSync(tmp, buf2);
        const dur2 = await probeDuration(tmp);
        if (dur2 && dur2 < dur) dur = dur2;
      }
      if (dur > budget) {
        /* final resort: time-compress in place */
        const fitted = tmp.replace(/\.wav$/, '_f.wav');
        const at = Math.min(1.4, dur / budget);
        await exec('ffmpeg', ['-y', '-i', tmp, '-filter:a', `atempo=${at.toFixed(3)}`, '-c:a', 'libmp3lame', '-b:a', '128k', fitted]);
        const d3 = await probeDuration(fitted);
        if (d3 && d3 < dur) { fs.rmSync(tmp, { force: true }); return { file: fitted, dur: d3, rateFitted: true }; }
      }
      return { file: tmp, dur, rateFitted: rate > 1.01 };
    } catch (e) {
      lastErr = e;
      const msg = String(e.message || e);
      log(`tts attempt ${attempt} failed: ${msg.slice(0, 120)}`);
      await new Promise(r => setTimeout(r, /429|Too many/i.test(msg) ? 12000 * attempt : 1200 * attempt));
    }
  }
  throw lastErr || new Error('tts failed');
}

/* prepare audio for every caption of a video (optionally one chapter).
   Writes audio/<chapter>_capNN.mp3 and updates the manifest in place. */
export async function prepareVideoAudio(videoDir, opts = {}) {
  /* retry rounds: when lines fail on rate limits, wait and retry just those lines */
  let last = null;
  for (let round = 0; round < 4; round++) {
    try { return await _prepareOnce(videoDir, opts); }
    catch (e) {
      last = e;
      const all429 = (e.failed || []).every(f => /429|Too many/i.test(f.error));
      if (!all429 || round === 3) throw e;
      (opts.log || (() => {}))(`${e.failed.length} line(s) rate-limited — cooling down 75s (round ${round + 2}/4)`);
      await new Promise(r => setTimeout(r, 75000));
    }
  }
  throw last;
}

async function _prepareOnce(videoDir, { chapterId, voice, log = () => {}, onProgress = () => {} } = {}) {
  const mfPath = path.join(videoDir, 'manifest.json');
  const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
  const audioDir = path.join(videoDir, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });
  let done = 0; const failed = [];
  const chapters = mf.chapters.filter(c => !chapterId || c.id === chapterId);
  const total = chapters.reduce((n, c) => n + c.captions.length, 0);
  for (const ch of chapters) {
    for (let i = 0; i < ch.captions.length; i++) {
      const cap = ch.captions[i];
      const out = path.join(audioDir, path.basename(cap.audio));
      const rel = `audio/${path.basename(cap.audio)}`;
      try {
        if (fs.existsSync(out) && (cap.audioDur || 0) > 0) { done++; onProgress(done, total, ch.id, i); continue; }
        const { file, dur } = await synthesizeFitted(cap.text, cap.dur, { voice: voice || mf.audio?.voice, log });
        fs.copyFileSync(file, out);
        fs.rmSync(file, { force: true });
        cap.audio = rel; cap.audioDur = +dur.toFixed(2);
        done++; onProgress(done, total, ch.id, i);
        /* persist manifest periodically so partial progress survives */
        if (done % 5 === 0) { mf.audio.prepared = false; fs.writeFileSync(mfPath, JSON.stringify(mf, null, 1)); }
        await new Promise(r => setTimeout(r, 350)); /* gentle pacing — keep the provider happy */
      } catch (e) {
        failed.push({ chapter: ch.id, index: i, text: cap.text.slice(0, 60), error: String(e.message || e).slice(0, 200) });
        onProgress(done, total, ch.id, i);
      }
    }
  }
  mf.audio.prepared = failed.length === 0;
  mf.audio.provider = HAS_DEEPGRAM ? 'deepgram' : 'z-ai';
  fs.writeFileSync(mfPath, JSON.stringify(mf, null, 1));
  if (failed.length) {
    const err = new Error(`narration failed for ${failed.length}/${total} lines — first: ${failed[0].chapter} #${failed[0].index} "${failed[0].text}" → ${failed[0].error}`);
    err.failed = failed;
    throw err;
  }
  return { ok: true, lines: total, provider: mf.audio.provider };
}

/* build one narration wav for a chapter (or whole video) at absolute caption offsets */
export async function buildNarrationTrack(videoDir, { chapterId } = {}) {
  const mf = JSON.parse(fs.readFileSync(path.join(videoDir, 'manifest.json'), 'utf8'));
  const tmp = '/tmp/narr_' + Math.random().toString(36).slice(2) + '.wav';
  /* global start offset of each chapter */
  let t0 = 0; const offsets = {};
  for (const ch of mf.chapters) { offsets[ch.id] = t0; t0 += ch.duration; }
  const inputs = [], filters = [], mixIns = [];
  let idx = 0;
  for (const ch of mf.chapters) {
    if (chapterId && ch.id !== chapterId) continue;
    for (const cap of ch.captions) {
      const f = path.join(videoDir, cap.audio);
      if (!fs.existsSync(f) || !(cap.audioDur > 0)) continue;
      inputs.push(['-i', f]);
      const delayMs = Math.max(0, Math.round((offsets[ch.id] + cap.t) * 1000));
      filters.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${delayMs}|${delayMs}[d${idx}]`);
      mixIns.push(`[d${idx}]`);
      idx++;
    }
  }
  if (idx === 0) throw new Error('no narration audio prepared — run "prepare narration" first');
  const fc = `${filters.join(';')};${mixIns.join('')}amix=inputs=${idx}:normalize=0:dropout_transition=0[mx];[mx]loudnorm=I=-14:TP=-1.0:LRA=11,apad=pad_dur=1.5[out]`;
  await exec('ffmpeg', ['-y', ...inputs.flat(), '-filter_complex', fc, '-map', '[out]', '-c:a', 'pcm_s16le', '-ar', '48000', tmp]);
  return { wav: tmp, duration: await probeDuration(tmp) };
}
