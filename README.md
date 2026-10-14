# Hyperframes batch project — "How does a machine learn to read?"

A complete, render-ready project for your **Hyperframes batch renderer notebook (GPU / Google
Drive edition)**: a 12-scene, **11-minute** educational video about neural networks, drawn
entirely with generated HTML/JS/SVG graphics — **no external assets, no fonts to install, no
images to upload**.

---

## Quick start — init & run

**Requirements:** [Bun](https://bun.sh) 1.1+ (or Node 18+) and any modern browser. Optional,
only for MP4 export / re-rendering: `python3` + `playwright` + `ffmpeg`. No API keys anywhere —
the GLM SDK is keyless.

```bash
# 1 — get the code
git clone https://github.com/Mohamedkhaled420/hyperframes-nn-video.git
cd hyperframes-nn-video
# …or init a fresh repo from these files instead:
#   git init
#   git add .
#   git commit -m "init"
#   git remote add origin <your-repo-url> && git push -u origin main

# 2 — install the single JS dependency (keyless GLM SDK)
bun install                # or: npm install

# 3 — start the development server
bun glm_server.mjs         # or: node glm_server.mjs    (PORT=9000 bun glm_server.mjs to change port)
```

Then open **http://localhost:8787** — the full player with the AI tutor (`A`), AI Studio (`G`,
generates a whole new scenes folder from a prompt) and Export MP4 (`E`). Playback also works
with no server at all: just double-click `PLAYER.html`.

For server-side MP4 export of AI-generated packs, add the render toolchain:

```bash
python3 -m pip install playwright && python3 -m playwright install chromium
# ffmpeg must be on PATH:  apt install ffmpeg   /   brew install ffmpeg
```

---

## Deploy to Vercel (serverless edition)

The repo is a **Vercel-ready web app**: `vercel.json` at the root plus an `api/`
directory of serverless functions. One command deploys it:

```bash
npm i -g vercel
vercel deploy --prod        # from this folder (login first: vercel login)
```

What runs on the serverless deployment — no tunnels, no cookies, public URL:

| feature | on Vercel | notes |
|---|---|---|
| Player + the 11-minute video | ✅ | static; `/` serves `PLAYER.html` |
| AI tutor (Ask AI, `A`) | ✅ | env-LLM, keyless SDK, or offline fallback (see below) |
| Pack library + switcher | ✅ | bundled pack (`api/packs`, `api/pack/:slug`) |
| Export MP4 (`E`, bundled) | ✅ | instant pre-rendered master, served statically |
| AI Studio (`G`) | ❌ | multi-minute GLM + Chromium + TTS pipeline — needs the companion server |
| Export of AI-generated packs | ❌ | same — the companion server renders them |

**AI tutor on serverless — three tiers** (`api/ask.mjs` picks automatically):

1. **Real AI via env vars** — set `LLM_API_KEY` + `LLM_BASE_URL` (and optionally
   `LLM_MODEL`) in the Vercel project settings to use any OpenAI-compatible API
   (e.g. `https://api.z.ai/v1`, OpenAI, Groq, …).
2. **Keyless SDK** — `z-ai-web-dev-sdk` works wherever a `.z-ai-config` file
   exists (sandboxed environments, configured machines).
3. **Offline fallback (default)** — with no key configured, Ask AI still works:
   it answers with the matching chapter's own narration + scene notes,
   clearly labeled as offline mode. The player stays fully usable with zero
   configuration. `/api/health` reports which tier is active.

The buttons that need the full pipeline say so in the UI and point you to
`bun glm_server.mjs`. Both worlds share the same response contracts
(`api/*` mirrors `glm_server.mjs`), so the player is identical everywhere.
A stub-based QA suite for the functions lives at `scripts/qa_vercel_funcs.mjs`
(`node scripts/qa_vercel_funcs.mjs` — includes one real GLM call).

---

## Rendered MP4 + narration speech (already generated)

A full local render lives in **`render/`**:

- `how_machines_learn_to_read_720p.mp4` — the complete 11-minute video (1280×720, 30 fps,
  H.264 + AAC narration, burned-in captions), built by frame-stepping every scene's
  deterministic `render(t)` with headless Chromium and encoding with ffmpeg.
- `narration_full.m4a` — the narration-only speech track (keyless TTS via
  `z-ai-web-dev-sdk`, voice `jam`). Captions and audio share the same scripted windows;
  where a chapter's narration runs long it is time-compressed to fit.
- `s01_hook.mp4 … s12_outro.mp4` — the 12 per-scene clips (same encoding), if you want to
  re-stitch or re-order chapters yourself.

## Watch it now — no renderer needed

Open **`PLAYER.html`** (this folder) in any browser — Chrome, Edge, Firefox, double-click, no
server, no internet. It bundles all 12 scenes into one file with a full player:

- one global 11:00 timeline with chapter markers, scrubbing and auto-advance between scenes
- chapter chips, play/pause, prev/next chapter, fullscreen
- keyboard: `Space` play/pause · `←`/`→` ±1 s (`Shift` ±5 s) · `↑`/`↓` chapter · `F` fullscreen

The scenes inside are driven through the same deterministic `render(t)` contract the batch
renderer uses, so what you preview is exactly what renders. Individual scenes can still be
opened directly: `s01_hook/index.html#preview` gives the single-scene scrubber.

Prefer one download? Grab `hyperframes_nn_video.zip` (one level up) — the whole project
including PLAYER.html.

---

## AI tutor — keyless GLM integration

The player ships with an **"Ask AI" tutor** (button in the control bar, or press `A`): a chat
drawer that knows exactly which chapter is on screen and answers in the video's own terms and
numbers. It is powered by **GLM through `z-ai-web-dev-sdk` — completely keyless**: no API key
to create, manage or embed; the SDK handles authentication itself, and it runs **server-side
only** (never in browser code).

```bash
cd hyperframes_nn_video
bun add z-ai-web-dev-sdk        # once (already vendored if node_modules/ is present)
bun glm_server.mjs              # starts on http://localhost:8787 (or set PORT=...)
```

Then open **http://localhost:8787** — the same player, now AI-enabled. The server:

- serves the project folder statically (`/` → `PLAYER.html`);
- exposes `POST /api/ask` with body `{ question, chapter, t, history }` and builds the GLM
  system prompt **from this project's own docs** — `narration_script.md` (the chapter's
  narration) + `scene_docs/` (its beats and implementation notes), so answers can't drift
  from what's on screen;
- exposes `GET /api/health` for a quick check.

Without the server the player still works perfectly — the drawer just explains how to start
it. The tutor keeps a short in-conversation history (last 6 turns) so follow-ups work.

## AI Studio — let GLM write a new video

Press **AI Studio** (violet button, or `G`) and describe a topic:

```text
How do plants make food? Photosynthesis from sunlight to sugar, for curious kids.
```

GLM then runs a full production pipeline server-side and a brand-new playable pack appears
in the pack switcher (top-right) within a few minutes:

1. **Plan** — one GLM call turns the prompt into a scene-by-scene outline JSON
   (titles, durations, accent colors, timed narration windows, visual beats);
2. **Scene code** — one GLM call per scene writes just the creative scene body against
   the documented engine API (`studio/scene_guide.md` + a real example scene are the
   system prompt); every body is validated (forbidden APIs, engine-name redeclarations,
   brace balance, `new Function` syntax parse) and retried with the error text if needed;
3. **Assembly** — bodies are stitched into self-contained scenes with `studio/shell.html`
   + `studio/engine.js` (the same shell that built the bundled video), plus a
   batch-renderer-compatible `jobs.csv` and `narration_script.md` under `generated/<slug>/`;
4. **Smoke test** — each scene boots in headless Chromium; failing scenes are regenerated
   once with the errors, or fall back to a built-in layout;
5. **Voice** — every caption line is narrated through keyless TTS (voice `jam`),
   speed-fitted into its caption window, stored under `generated/<slug>/tts/`.

Packs play through the same `render(t)` contract as the bundled video — chapter chips,
scrubbing, keyboard and the AI tutor all work (the tutor reads the pack's own narration).

## Export MP4

The **Export MP4** button (footer, or `E`) renders the current pack to a real video file:

- the bundled video delivers its pre-rendered master instantly;
- any AI-generated pack is rendered server-side by `studio/export_pack.py`:
  Playwright frame-steps every scene's deterministic `render(t)` (1280×720 @ 30 fps),
  ffmpeg encodes H.264, per-line narration is mixed onto the timeline (atempo-fitted),
  tracks are concatenated with `+faststart` — progress streams into the modal;
- the finished MP4 downloads straight from the job (`exports/<slug>-<stamp>.mp4`).

Requirements for export on your own machine: `python3` + `playwright` + `ffmpeg`
(already present where the bundled master was rendered).

## What's in this folder

```
hyperframes_nn_video/
├── README.md              ← you are here (workflow + architecture notes)
├── PLAYER.html            ← ★ one-click preview of the whole 11-min video
├── glm_server.mjs         ← ★ keyless GLM server for the "Ask AI" tutor
├── VIDEO_PLAN.md          ← the full 11-minute video description, scene by scene
├── narration_script.md    ← timed voice-over / caption script (also burned into the scenes)
├── jobs.csv               ← 12 rows, one per scene — drop into DRIVE_ROOT
├── concat_list.txt        ← ffmpeg stitch list for the 12 rendered mp4s
├── scene_docs/            ← one MD per scene: visual beats + implementation notes
│   ├── s01_hook.md … s12_outro.md
├── s01_hook/index.html    ← scene compositions (fully self-contained, ~25-45 KB each)
├── s02_pixels/index.html
├── …
└── s12_outro/index.html
```

## Upload → render → stitch (3 steps)

1. **Upload** — copy `jobs.csv` and the **12 scene folders** into
   `MyDrive/hyperframes_projects/` (the notebook's `DRIVE_ROOT`), replacing the starter
   `jobs.csv`. The layout ends up exactly like the notebook expects:

   ```
   MyDrive/hyperframes_projects/
   ├── jobs.csv
   ├── s01_hook/index.html
   ├── s02_pixels/index.html
   ├── …
   └── s12_outro/index.html
   ```

2. **Render** — run the notebook: setup cells 1–5 once, then cells 6–9 (dry run, then render).
   Every row is `quality=looks, 1080p landscape, 30 fps, mp4, NVENC + browser GPU` — the
   defaults you already use. Each scene renders to `DRIVE_ROOT/<scene>/<scene>.mp4` (written as
   `.part` then renamed, logs saved next to it). Re-runs skip finished rows, so disconnects are
   free to recover from.

3. **Stitch** — the 12 clips are sequential chapters; concatenate them losslessly:

   ```bash
   ffmpeg -f concat -safe 0 -i concat_list.txt -c copy how_machines_learn_to_read.mp4
   ```

   `concat_list.txt` references `<scene>/<scene>.mp4` relative to `DRIVE_ROOT` — run the
   command from Drive (or with drive/ mounted locally), or edit paths to point at wherever the
   clips live. (Optional: add an audio track — narration_script.md is the voice-over script.)

## How each scene is built (the architecture)

Every `index.html` is **fully self-contained** — one file per scene, zero references:

- **Shell** — declares `data-composition-duration` (40–70 s), `data-composition-fps="30"` and
  `data-composition-variables='{"captions": true}'`; stage is a 1920×1080 SVG that scales to fit
  any viewport.
- **Engine (inlined, ~450 lines)** — a deterministic timeline runtime. Every frame is a pure
  function of time: `render(t)` folds all registered ops (`fade / pop / wipe / draw / to`),
  then runs `sync(fn, t0, t1)` interpolators (bars, dots, morphs). No CSS transitions, no rAF
  accumulation — so **seeking to any frame always produces the exact same pixels**, which is
  what a frame-stepping renderer needs.
- **Data (inlined JSON)** — the trained 35→12→10 network, its 300-epoch history, 15 snapshot
  predictions, the test digits, the static/blend test results and every derived display number.
  One training run, computed at build time, shared by all 12 scenes → all numbers agree with
  each other and with the narration.
- **Scene code** — the chapter's visuals as timeline ops over that data.

**Renderer contract:** scenes read variables via `window.__hyperframes.getVariables()`
(`var_captions=true` toggles burned-in captions) and expose
`window.__scene = { render(t), duration }`. They also accept seek messages
`{type:'hf-seek', t}` / `{type:'seek', t}` via `postMessage` and the `hf-seek` event, and
autoplay in real time otherwise — so any driver style (seek-stepping, realtime capture, or
virtual-time) works. If your Hyperframes version wants the duration via CLI instead of the
data-attribute, add `--duration 40` (per-scene value) to the row's `extra_args` — no other
change needed.

**Preview without rendering:** open any `index.html#preview` in a normal browser — you get a
play/pause + arrow-key scrubber (space = play/pause, ←/→ = ±1 s, Shift+←/→ = ±5 s). Use
`#freeze` to load paused at t=0 for scripted screenshots.

## jobs.csv

| column | value | notes |
|---|---|---|
| `folder` | `s01_hook` … `s12_outro` | one folder per scene, `index.html` inside |
| `output_name` | same as folder | renders `s01_hook.mp4` into its own folder |
| `fps` | `30` | matches `data-composition-fps` |
| `quality` / `resolution` / `format` | `looks` / `landscape` / `mp4` | 1080p H.264 |
| `gpu`, `browser_gpu` | `yes` / `yes` | NVENC encode + EGL Chrome capture |
| `var_captions` | `true` | set `false` to re-render caption-free versions |

Total render: 660 s of video across 12 rows. On a T4 with NVENC each scene typically renders
faster than realtime; expect the whole batch in roughly 15–40 minutes plus Drive sync.

## Rebuilding / editing

The generator lives outside the upload set (in the workstation's `scripts/`):
`nn_build.py` → `build/data.json` → `build_video.py` (merge + jobs/concat/narration).
Edit a scene's `sNN.js`, re-run `build_video.py`, re-upload that one folder.
All training is seeded — rebuilds are byte-identical.
