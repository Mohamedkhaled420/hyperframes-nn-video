/* GET /api/job/:id — job polling. The static-master job resolves instantly;
   long-running jobs exist only on the companion server. */

const MASTER_URL = '/render/how_machines_learn_to_read_720p.mp4';

export default async function handler(req, res) {
  const id = req.query && (req.query.id || req.query.jobId);
  if (id === 'static-master')
    return res.status(200).json({
      id, type: 'export', status: 'done', phase: 'done', progress: 100,
      log: ['bundled master is served statically on this deployment'],
      result: {
        url: MASTER_URL,
        filename: 'how_machines_learn_to_read_720p.mp4',
        size: 27246033,
        instant: true,
      },
      error: null,
    });
  return res.status(404).json({
    error: 'no such job — long-running jobs (AI Studio / pack export) need the companion server',
  });
}
