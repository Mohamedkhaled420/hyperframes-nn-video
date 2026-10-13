/* GET /api/health — deployment status + which features are live here. */
export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    runtime: 'vercel-serverless',
    features: {
      ask: true,            // AI tutor (keyless GLM)
      packs: true,          // pack library (bundled)
      export_bundled: true, // instant pre-rendered master download
      generate: false,      // needs the long-running companion server
      export_generated: false,
    },
    time: new Date().toISOString(),
  });
}
