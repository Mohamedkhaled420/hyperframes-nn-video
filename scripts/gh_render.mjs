/* gh_render.mjs — GitHub Actions render entrypoint.
   Env: VIDEO (pack id), CHAPTERS ("all" or comma-separated ids), FPS.
   Renders each requested chapter with the render-service export pipeline
   (Playwright frame-stepping → ffmpeg stdin, narration muxed, QC-gated) and
   writes a job summary for the Actions run page. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIDEO = process.env.VIDEO || 'nn-video';
const FPS = Math.max(12, Math.min(60, parseInt(process.env.FPS || '30', 10) || 30));
const videoDir = path.join(ROOT, 'public/videos', VIDEO);
if (!fs.existsSync(path.join(videoDir, 'manifest.json'))) {
  console.error(`pack not found: public/videos/${VIDEO}/manifest.json`);
  process.exit(1);
}
const mf = JSON.parse(fs.readFileSync(path.join(videoDir, 'manifest.json'), 'utf8'));
if (mf.audio && mf.audio.prepared !== true) {
  console.error('narration audio not prepared (manifest.audio.prepared !== true) — refusing to render a silent video');
  process.exit(1);
}

const want = (process.env.CHAPTERS || 'all').trim();
const ids = want === 'all' || !want ? mf.chapters.map(c => c.id) : want.split(',').map(s => s.trim()).filter(Boolean);
const unknown = ids.filter(id => !mf.chapters.some(c => c.id === id));
if (unknown.length) {
  console.error(`unknown chapter ids: ${unknown.join(', ')} (available: ${mf.chapters.map(c => c.id).join(', ')})`);
  process.exit(1);
}

const { exportVideo } = await import(path.join(ROOT, 'mini-services/render-service/lib/export.mjs'));

const summary = [];
const t0 = Date.now();
let failed = 0;
for (const id of ids) {
  const ch = mf.chapters.find(c => c.id === id);
  console.log(`\n=== ${id} — ${ch.title} (${ch.duration}s @ ${FPS}fps) ===`);
  try {
    const r = await exportVideo({
      videoDir,
      videoId: VIDEO,
      chapterId: id,
      fps: FPS,
      log: m => console.log('  ·', m),
      onProgress: (frame, total) => { if (frame % 300 === 0 || frame === total) console.log(`  frames ${frame}/${total}`); },
    });
    if (!r.ok) throw new Error(`QC failed: ${r.qc?.issues?.join('; ') || 'unknown'}`);
    summary.push({ id, title: ch.title, ok: true, file: r.file, duration: r.duration, rms: r.qc?.rms });
  } catch (e) {
    failed++;
    console.error(`  ✗ ${id}: ${String(e.message || e).slice(0, 300)}`);
    summary.push({ id, title: ch.title, ok: false, error: String(e.message || e).slice(0, 200) });
  }
}

/* job summary for the Actions run page */
const sumPath = process.env.GITHUB_STEP_SUMMARY;
if (sumPath) {
  const rows = summary.map(s => `| ${s.id} | ${s.title} | ${s.ok ? `✅ ${s.file || ''} · ${s.duration?.toFixed?.(1) || '?'}s · RMS ${s.rms ?? '?'} dB` : `❌ ${s.error}`} |`).join('\n');
  fs.appendFileSync(sumPath, `\n## Render — ${VIDEO}\n\n| chapter | title | result |\n|---|---|---|\n${rows}\n\nTotal: ${(Date.now() - t0) / 1000 | 0}s · ${failed ? `${failed} failed` : 'all ok'}\n`);
}
console.log(`\nDONE: ${summary.length - failed}/${summary.length} chapters rendered in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
process.exit(failed ? 1 : 0);
