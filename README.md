# hyperframes-nn-video

AI-narrated motion-graphics video player + pipeline. Next.js 16 UI (player, chapter pills, AI Studio) with a companion Node render-service (`mini-services/render-service`) that handles TTS narration, MP4 export, and AI pack generation.

## What runs where

| Capability | Vercel UI | Local (full setup) |
|---|---|---|
| Browse / play packs (static files) | ✅ | ✅ |
| Chapter scrubbing, captions, audio | ✅ | ✅ |
| TTS narration prep | ❌ (503) | ✅ (render-service) |
| MP4 export (ffmpeg) | ❌ (503) | ✅ (render-service) |
| AI pack generation | ❌ (503) | ✅ (render-service) |

The render-service is a long-running Node process (headless Chromium + ffmpeg + TTS) and **cannot run inside Vercel serverless**. The deployed UI detects this and shows a clean 503 with a hint.

## Deploying the UI to Vercel

1. Import the repo — framework preset **Next.js**, root directory `/`, build command default (`npm run build`).
2. No environment variables required for the UI itself.
3. Deploy. Packs under `public/videos/**` and `public/generated/registry.json` are served statically.

## Enabling the heavy pipeline (TTS / export / generate) from a Vercel deployment

Run the render-service on a machine that stays up (your PC, a VPS) and expose it:

```bash
# local machine / VPS
cd mini-services/render-service
npm i && node index.mjs           # listens on :3030

# expose it publicly (choose one)
cloudflared tunnel --url http://localhost:3030
# or: ngrok http 3030
```

Then in Vercel → Project → Settings → Environment Variables:

```
RENDER_SERVICE_URL = https://<your-tunnel-host>
```

The relay route (`/api/relay/*`) forwards all TTS / export / generate / job-stream calls there.

## Local development (full pipeline)

```bash
npm install
npm run dev                        # UI on :3000
cd mini-services/render-service && npm i && node index.mjs   # pipeline on :3030
```

Production self-host:

```bash
npm run build:selfhost && npm start
```

## Environment (render-service)

| Variable | Purpose |
|---|---|
| `DEEPGRAM_API_KEY` | Deepgram TTS voices (aura-2); falls back to built-in TTS if unset |
| `RENDER_SERVICE_URL` | (Next.js side) upstream host for the relay route |
