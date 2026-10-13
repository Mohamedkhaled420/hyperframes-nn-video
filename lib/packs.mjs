/* Shared pack library for the serverless deployment (bundled pack only —
   AI-generated packs live on the long-running companion server). */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTO = "if (location.hash.indexOf('freeze') < 0){";

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

async function bundledMeta() {
  const b = await bundledPayload();
  return { slug: b.slug, title: b.title, tagline: b.tagline,
           chapters: b.scenes.length, total: b.total, generated: false };
}

export { bundledPayload, bundledMeta };
