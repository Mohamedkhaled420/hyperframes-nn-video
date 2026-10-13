/* GET /api/packs — pack library. Serverless deployments serve the bundled
   pack; AI-generated packs exist only on the companion server. */
import { bundledMeta } from '../lib/packs.mjs';

export default async function handler(req, res) {
  try {
    return res.status(200).json({ packs: [await bundledMeta()] });
  } catch (e) {
    return res.status(500).json({ error: 'pack list failed: ' + (e && e.message || e) });
  }
}
