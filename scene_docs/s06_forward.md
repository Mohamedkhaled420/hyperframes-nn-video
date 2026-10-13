# s06_forward — Chapter 5 — Running the network

**Duration:** 60 s · **Accent:** `#58C4DD` · **Output:** `s06_forward/s06_forward.mp4` (1080p landscape, 30 fps)
**Self-contained:** single `index.html` — inline CSS + engine + data + scene code, zero external assets.

**Goal:** a complete, legible forward pass on the trained network — then show it is the SAME
weights producing different answers for different digits.

### Visual beats
| t | beat |
|---|------|
| 1.0 | Trained network (weight-colored lines) + digit grid area + bars layout fade in |
| 5.2–6.0 | Input grid of a 3 pops; arrow into the input layer |
| 6.4 | State A engages: input neurons take pixel brightness |
| 12.0 | `h = σ(W₁x + b₁)` — hidden neurons light yellow ∝ activation |
| 24.0 | `p = softmax(W₂h + b₂)` — output neurons light blue |
| 30.2–32 | Probability bars grow with % labels; prediction "3 — 99%" (gold, mono) |
| 41.2 / 45.6 / 50.0 | Replay for 7, 5, noisy-8: grid crossfades, activations/bars/prediction morph (1.1 s blend each) |
| 55.3–57 | Everything dims to 0.15; closing wipe: "no rules about loops or strokes were written — only numbers." |

### Implementation notes
- ONE master `sync` (t ∈ [6.4, end]) drives everything from `DATA.s6` (4 states: grid, h, p,
  pred, conf for 3/7/5/noisy-8). Within each window the first 1.1 s lerps from the previous
  state — smooth morphs, zero per-frame branching.
- Bars (`bars()` helper) show % labels; the correct class is highlighted gold.

---
*Regeneration: edit `scripts/scenes/s06.js`, re-run `python3 scripts/build_video.py`,
re-upload the `s06_forward/` folder. Data comes from `scripts/nn_build.py` (seeded → reproducible).*
