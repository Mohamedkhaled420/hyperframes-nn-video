/* GET /api/pack/:slug — full pack payload (scene HTML embedded).
   Only the bundled pack exists on serverless deployments. */
import { bundledPayload } from '../../lib/packs.mjs';

export default async function handler(req, res) {
  const slug = req.query && (req.query.slug || req.query.id);
  if (slug !== 'bundled')
    return res.status(404).json({ error:
      'unknown pack — AI-generated packs live on the companion server (bun glm_server.mjs)' });
  try {
    return res.status(200).json(await bundledPayload());
  } catch (e) {
    return res.status(500).json({ error: 'pack payload failed: ' + (e && e.message || e) });
  }
}
