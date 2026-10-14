/* POST /api/export — export a pack to MP4.
   On serverless we cannot run the Chromium/ffmpeg pipeline, but the bundled
   pack's pre-rendered master is a static file — emulate the companion
   server's instant-master job so the player flow works unchanged. */
import { readJson } from '../lib/tutor.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'POST only' });
  const body = await readJson(req);
  const pack = String(body.pack || 'bundled');
  if (pack !== 'bundled')
    return res.status(503).json({ error:
      'This deployment has no headless renderer. The player falls back to ' +
      'rendering the MP4 right in your browser (MediaRecorder) — just press ' +
      'Export again. For the classic server pipeline run the companion ' +
      'server: node glm_server.mjs' });
  return res.status(200).json({ jobId: 'static-master' });
}
