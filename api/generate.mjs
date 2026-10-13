/* POST /api/generate — AI Studio scene generation.
   The full pipeline (multi-call GLM, headless-Chromium smoke tests, per-line
   TTS) runs for minutes and needs Chromium + ffmpeg — impossible in
   serverless. Point users at the companion server. */
export default async function handler(req, res) {
  return res.status(503).json({ error:
    'AI Studio scene generation needs the long-running companion server ' +
    '(bun glm_server.mjs) — the serverless runtime cannot host the ' +
    'multi-minute GLM + headless-Chromium + TTS pipeline.' });
}
