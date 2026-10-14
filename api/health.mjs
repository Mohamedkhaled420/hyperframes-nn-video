/* GET /api/health — deployment status + which features are live here. */
export default async function handler(req, res) {
  const hasEnvLlm = !!(process.env.LLM_API_KEY && process.env.LLM_BASE_URL);
  return res.status(200).json({
    ok: true,
    runtime: 'vercel-serverless',
    ai: {
      mode: hasEnvLlm ? 'env-llm' : 'fallback',   // env-llm | sdk | fallback
      note: hasEnvLlm
        ? 'LLM_API_KEY/LLM_BASE_URL configured'
        : 'no AI key on this deployment — /api/ask answers from the embedded script; set LLM_API_KEY + LLM_BASE_URL for real AI',
    },
    features: {
      ask: true,            // AI tutor (env-llm, or offline fallback)
      packs: true,          // pack library (bundled)
      export_bundled: true, // instant pre-rendered master download
      generate: true,       // AI Studio: LLM plans + writes scenes -> pack JSON
      export_generated: false, // server-side render impossible in serverless…
      export_client: true,  // …but the visitor's browser renders MP4 locally
    },
    time: new Date().toISOString(),
  });
}
