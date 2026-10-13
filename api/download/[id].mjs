/* GET /api/download/:id — deliver finished jobs. static-master redirects to
   the static pre-rendered master; anything else needs the companion server. */
export default async function handler(req, res) {
  const id = req.query && (req.query.id || req.query.jobId);
  if (id === 'static-master')
    return res.redirect(307, '/render/how_machines_learn_to_read_720p.mp4');
  return res.status(404).json({
    error: 'not found — generated-pack downloads need the companion server',
  });
}
