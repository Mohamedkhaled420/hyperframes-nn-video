/* Shared pack library for the serverless deployment (bundled pack only —
   AI-generated packs live on the long-running companion server).
   Data comes from the generated embedded bundle (lib/api_bundle.mjs): node
   file tracing follows the import, so every byte travels with the function —
   no vercel.json includeFiles semantics involved, nothing to mis-configure. */
import { JOBS_CSV, SCENES } from './api_bundle.mjs';

const AUTO = "if (location.hash.indexOf('freeze') < 0){";
const BY_FOLDER = new Map(SCENES.map(s => [s.folder, s.html]));

async function bundledPayload() {
  const order = JOBS_CSV.trim().split('\n').slice(1)
    .map(r => r.split(',')[0].trim());
  const scenes = [];
  let t0 = 0;
  for (const folder of order) {
    let html = BY_FOLDER.get(folder);
    if (html == null) throw new Error('scene missing from bundle: ' + folder);
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
