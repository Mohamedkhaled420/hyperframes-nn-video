// GET /api/ai-models — list which models the configured LLM_API_KEY can use.
// Pure diagnostics: returns model IDs only, never the key itself.
export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ error: 'GET only' });
  const key = process.env.LLM_API_KEY || '';
  const base = (process.env.LLM_BASE_URL || '').replace(/\/+$/, '');
  if (!key || !base)
    return res.status(400).json({ error:
      'LLM_API_KEY / LLM_BASE_URL not configured on this deployment' });
  try {
    const r = await fetch(base + '/models', {
      headers: { Authorization: 'Bearer ' + key },
    });
    const data = await r.json();
    if (!r.ok)
      return res.status(r.status).json({ error: 'upstream ' + r.status,
        detail: String(JSON.stringify(data)).slice(0, 300) });
    const ids = (data.data || []).map(m => m.id).sort();
    return res.status(200).json({
      configured_model: process.env.LLM_MODEL || 'glm-4.6',
      count: ids.length,
      models: ids,
    });
  } catch (e) {
    return res.status(502).json({ error: 'fetch failed: ' + (e && e.message || e) });
  }
}
