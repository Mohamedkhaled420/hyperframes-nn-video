/* POST /api/render/dispatch — one-click cloud render.
   Sends a repository_dispatch event to the GitHub repo, which runs
   .github/workflows/render.yml on a free Ubuntu runner (the repo is public →
   free Actions minutes) with Playwright + ffmpeg, and uploads the MP4s as
   workflow artifacts. Needs RENDER_GH_TOKEN (a GitHub PAT with repo scope).
   Without a token it answers 501 with instructions to run the workflow
   manually from the GitHub Actions tab (workflow_dispatch needs no token). */
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const REPO = process.env.GITHUB_REPO || 'Mohamedkhaled420/hyperframes-nn-video';
const ALLOWED_VIDEOS = ['nn-video']; /* in-repo packs only — nothing arbitrary */
let lastDispatch = 0;

export async function POST(req: NextRequest) {
  try {
    const token = process.env.RENDER_GH_TOKEN;
    if (!token) {
      return Response.json(
        {
          error: 'cloud render not configured',
          hint: 'Set RENDER_GH_TOKEN (GitHub PAT) in your environment, or run the workflow manually: GitHub → Actions → render → Run workflow.',
          actionsUrl: `https://github.com/${REPO}/actions/workflows/render.yml`,
        },
        { status: 501 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const video = String(body.video || 'nn-video');
    if (!ALLOWED_VIDEOS.includes(video)) {
      return Response.json({ error: `video must be one of ${ALLOWED_VIDEOS.join(', ')}` }, { status: 400 });
    }
    const chapters = String(body.chapters || 'all')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 12)
      .map((c) => (c === 'all' ? 'all' : c.replace(/[^a-z0-9_-]/gi, '')))
      .join(',');
    const fps = [24, 30, 60].includes(+body.fps) ? +body.fps : 30;

    if (Date.now() - lastDispatch < 120_000) {
      return Response.json({ error: 'a cloud render was dispatched less than 2 minutes ago — wait for it to finish first' }, { status: 429 });
    }

    const r = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        event_type: 'render',
        client_payload: { video, chapters, fps: String(fps) },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      const detail = (await r.text().catch(() => '')).slice(0, 200);
      return Response.json({ error: `github dispatch ${r.status}: ${detail || 'rejected'}` }, { status: 502 });
    }
    lastDispatch = Date.now();
    return Response.json({
      ok: true,
      video,
      chapters,
      fps,
      actionsUrl: `https://github.com/${REPO}/actions/workflows/render.yml`,
      note: 'The render farm is spinning up. MP4s appear as artifacts on the workflow run page in ~2–5 minutes.',
    });
  } catch (e: unknown) {
    return Response.json({ error: String((e as Error)?.message || e || 'dispatch failed').slice(0, 300) }, { status: 503 });
  }
}
