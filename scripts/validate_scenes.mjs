/* Headless scene validation — the same check the pipeline runs on generated scenes.
   Usage: NODE_PATH=/home/z/.npm-global/lib/node_modules node scripts/validate_scenes.mjs <manifest> [chapterIds...] */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const manifestPath = process.argv[2] || '/home/z/my-project/public/videos/nn-video/manifest.json';
const only = process.argv.slice(3);
const base = path.dirname(manifestPath);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

let fails = 0;
for (const ch of manifest.chapters) {
  if (only.length && !only.includes(ch.id)) continue;
  const url = `${BASE_URL}/videos/${manifest.id}/${ch.scene}`;
  const errors = [];
  page.removeAllListeners('console');
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 20000 });
    const res = await page.evaluate(async () => {
      if (!window.__ready) return { ok: false, why: 'no __ready' };
      await window.__ready;
      const dur = window.__duration;
      if (!dur || dur <= 0) return { ok: false, why: 'zero duration' };
      window.__seek(0); window.__seek(dur / 3); window.__seek(dur * 0.8); window.__seek(dur);
      window.__seek(0); // back to start — determinism smoke
      return { ok: true, dur };
    });
    if (!res.ok) { console.log(`✗ ${ch.id}: ${res.why}`); fails++; continue; }
    if (Math.abs(res.dur - ch.duration) > 0.5) { console.log(`✗ ${ch.id}: duration ${res.dur} != manifest ${ch.duration}`); fails++; continue; }
    // screenshot at a mid beat
    const shot = `/home/z/my-project/tool-results/shot_${ch.id}.png`;
    await page.evaluate(t => window.__seek(t), ch.duration * 0.45);
    await page.screenshot({ path: shot });
    const realErrors = errors.filter(e => !/favicon/.test(e));
    if (realErrors.length) { console.log(`✗ ${ch.id}: console errors: ${realErrors[0]}`); fails++; continue; }
    console.log(`✓ ${ch.id} (${res.dur}s)`);
  } catch (e) {
    console.log(`✗ ${ch.id}: ${e.message.split('\n')[0]}`); fails++;
  }
}
await browser.close();
process.exit(fails ? 1 : 0);
