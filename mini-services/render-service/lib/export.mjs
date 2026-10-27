/* export.mjs — MP4 export. THE CRASH FIX:
   - frames are streamed into ffmpeg's stdin pipe (image2pipe/mjpeg) — nothing
     accumulates in memory, so long exports no longer OOM-crash;
   - narration audio is muxed in the same encode (aac 192k 48k stereo, -shortest);
   - broadcast-safe flags: yuv420p, even dims, bt709 color tags, +faststart. */
import fs from 'fs';
import path from 'path';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { chromium } from 'playwright';
import { buildNarrationTrack, probeDuration } from './tts.mjs';

const exec = promisify(execFile);

export async function exportVideo({ videoDir, videoId, chapterId = null, fps = 30, crf = 18, log = () => {}, onProgress = () => {} }) {
  const mf = JSON.parse(fs.readFileSync(path.join(videoDir, 'manifest.json'), 'utf8'));
  const chapters = mf.chapters.filter(c => !chapterId || c.id === chapterId);
  if (!chapters.length) throw new Error('no chapters for scope');
  const total = chapters.reduce((n, c) => n + c.duration, 0);
  const totalFrames = Math.round(total * fps);
  const outName = chapterId ? `${videoId}_${chapterId}.mp4` : `${videoId}_full.mp4`;
  const outPath = path.join(process.env.PUBLIC_DIR || '/home/z/my-project/public', 'exports', outName);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  /* 1) narration track (throws if audio not prepared → explicit, never silent) */
  log('building narration track…');
  const narr = await buildNarrationTrack(videoDir, { chapterId, minDur: total + 1.0 });
  log(`narration: ${narr.duration?.toFixed(1)}s`);

  /* 2) ffmpeg encoder on stdin */
  const ffArgs = [
    '-y',
    '-f', 'image2pipe', '-c:v', 'mjpeg', '-r', String(fps), '-i', '-',
    '-i', narr.wav,
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2:out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-shortest', '-movflags', '+faststart',
    outPath
  ];
  const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'pipe'] });
  let ffErr = '';
  ff.stderr.on('data', d => { ffErr += d.toString(); if (ffErr.length > 8000) ffErr = ffErr.slice(-4000); });
  const ffDone = new Promise((res, rej) => ff.on('close', code => code === 0 ? res() : rej(new Error('ffmpeg exited ' + code + ': ' + ffErr.slice(-500)))));
  let stdinClosed = false;
  const writeFrame = buf => new Promise((res, rej) => {
    if (stdinClosed || ff.exitCode !== null || !ff.stdin.writable) return res();
    ff.stdin.write(buf, err => { if (err && !stdinClosed && ff.exitCode === null) rej(err); else res(); });
  });

  /* 3) capture frames */
  const browser = await chromium.launch({ args: ['--disable-dev-shm-usage', '--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const urlBase = process.env.BASE_URL || 'http://localhost:3000';
  let frame = 0, tGlobal = 0;
  const t0 = Date.now();
  let encoderEarly = false;
  try {
    outer: for (const ch of chapters) {
      const url = `${urlBase}/videos/${videoId}/${ch.scene}`;
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      await page.evaluate(async () => { await window.__ready; });
      /* chapter boundary frame: hold first frame ~0.4s for a clean cut-in */
      const chFrames = Math.round(ch.duration * fps);
      for (let f = 0; f < chFrames; f++) {
        const t = f / fps;
        await page.evaluate(tt => window.__seek(tt), t);
        const shot = await page.screenshot({ type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
        await writeFrame(shot);
        if (ff.exitCode !== null) { encoderEarly = true; log(`encoder finished early at frame ${frame}/${totalFrames} — stopping capture`); break outer; }
        frame++; tGlobal = t;
        if (frame % 30 === 0) {
          const el = (Date.now() - t0) / 1000;
          const eta = el / frame * (totalFrames - frame);
          onProgress(frame, totalFrames, eta);
        }
      }
      log(`chapter ${ch.id} captured (${chFrames} frames)`);
    }
  } finally {
    stdinClosed = true;
    try { ff.stdin.end(); } catch {}
    await browser.close();
  }
  await ffDone;
  fs.rmSync(narr.wav, { force: true });
  onProgress(totalFrames, totalFrames, 0);

  /* 4) QC the artifact */
  const qc = await qcExport(outPath, total);
  log(`QC: ${qc.verdict}` + (qc.issues.length ? ' — ' + qc.issues.join('; ') : ''));
  return { ok: qc.verdict === 'pass', file: `/exports/${outName}`, abs: outPath, frames: frame, duration: total, qc };
}

/* post-export gates (adapted from motionmaxxing look.py / OpenMontage governance) */
export async function qcExport(file, expectDur) {
  const issues = [];
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration:stream=codec_type,codec_name,width,height', '-of', 'json', file]).catch(() => ({ stdout: '{}' }));
  const meta = JSON.parse(stdout || '{}');
  const dur = parseFloat(meta.format?.duration || 0);
  const streams = meta.streams || [];
  const hasVideo = streams.some(s => s.codec_type === 'video');
  const hasAudio = streams.some(s => s.codec_type === 'audio' && s.codec_name === 'aac');
  if (!hasVideo) issues.push('no video stream');
  if (!hasAudio) issues.push('NO AUDIO STREAM');
  if (!dur || Math.abs(dur - expectDur) > Math.max(1.0, expectDur * 0.05)) issues.push(`duration ${dur?.toFixed(1)}s vs expected ${expectDur?.toFixed(1)}s`);
  /* audio loudness — a silent track is a hard fail */
  let rms = null;
  if (hasAudio) {
    try {
      const { stderr } = await exec('ffmpeg', ['-i', file, '-af', 'astats=measure_overall=RMS_level:measure_perchannel=none', '-f', 'null', '-']);
      const m = stderr.match(/RMS level dB:\s*(-?[\d.]+)/);
      rms = m ? parseFloat(m[1]) : null;
      if (rms == null || rms < -60) issues.push(`audio silent (RMS ${rms} dB)`);
    } catch (e) { issues.push('audio probe failed'); }
  }
  return { verdict: issues.length ? 'fail' : 'pass', issues, duration: dur, hasAudio, rms };
}
