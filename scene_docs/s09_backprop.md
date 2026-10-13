# s09_backprop — Chapter 8 — Who is to blame?

**Duration:** 65 s · **Accent:** `#FC6255` · **Output:** `s09_backprop/s09_backprop.mp4` (1080p landscape, 30 fps)
**Self-contained:** single `index.html` — inline CSS + engine + data + scene code, zero external assets.

**Goal:** backpropagation, by hand, with exact numbers — the chain rule as "blame flowing
backwards."

### Visual beats
| t | beat |
|---|------|
| 1.0 | "descent needs a slope for every knob — how do we find all 562?" |
| 5.6–8.0 | Chain x →(w₁=0.8)→ h →(w₂=−0.5)→ y with loss box `C = (y−1)²` |
| 11.4–15.5 | Forward values appear: x=1, h=0.8, y=−0.4, C=1.96 |
| 22.0–23.0 | Red arrow loss→y: `dC/dy = −2.8` |
| 27.5 | Gold: `dC/dw₂ = −2.24 (−2.8 × 0.8)` |
| 32.5–36.5 | Dashed red arrows flow backwards (dC/dh = 1.4); gold `dC/dw₁ = 1.4 (1.4 × 1)` |
| 40.0 | Orange: "blame flows backwards, multiplying local slopes — the chain rule" |
| 45.6–47.4 | Update panel: `w₂ ← −0.276`, `w₁ ← 0.66` (η = 0.1) |
| 51.2–53.3 | New forward pass: y = −0.18 (teal), C = 1.40 (green); "one nudge: −0.4 → −0.18, loss 1.96 → 1.40" |
| 56.4 | Closing wipe: "backprop does exactly this — for all 562 weights. One pass forward, one pass back, one small step." |

### Implementation notes
- All numbers are exact for the chain shown (verified by hand) — they match the narration
  verbatim; the scene is pure constant data.
- Backward arrows are dashed red with `draw`; gold gradient labels sit under their weight
  arrows; the "new" y/loss values crossfade over the old ones.

---
*Regeneration: edit `scripts/scenes/s09.js`, re-run `python3 scripts/build_video.py`,
re-upload the `s09_backprop/` folder. Data comes from `scripts/nn_build.py` (seeded → reproducible).*
