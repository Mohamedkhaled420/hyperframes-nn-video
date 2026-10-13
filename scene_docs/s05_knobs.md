# s05_knobs — Chapter 4 — The knobs

**Duration:** 45 s · **Accent:** `#FFC53D` · **Output:** `s05_knobs/s05_knobs.mp4` (1080p landscape, 30 fps)
**Self-contained:** single `index.html` — inline CSS + engine + data + scene code, zero external assets.

**Goal:** show the REAL network with its REAL trained weights and count the 562 parameters.

### Visual beats
| t | beat |
|---|------|
| 1.0–2.4 | Real network fades in: 35 input pixels (mini-grid), 12 hidden, 10 output circles; all 540 lines colored by weight sign (blue/red) with opacity ∝ |w| |
| 6.0–7.5 | One weight highlighted gold (the largest |w| in W₁, index from build); "one line = one weight = one knob" |
| 11.0 | `35 × 12 = 420 weights + 12 biases`; W₂ group dims to focus |
| 19.2 | `12 × 10 = 120 weights + 10 biases`; focus swaps |
| 24.0 | `420 + 12 + 120 + 10 = 562 numbers` (gold) |
| 29.4 | Network dissolves; a 36×16 field of 562 dots appears, colors cycling deterministically |
| 31.0 / 35.5 | "not a program anyone wrote — just 562 numbers" · "modern models have billions — same recipe" |
| 40.8 | Final question wipes in gold: "So how do we find good values for them?" |

### Implementation notes
- Line colors/opacity come from `DATA.net.W1/W2` (the trained weights, rounded to 3 decimals).
- The dot shimmer is `fill = palette[(i + floor(2.5t)) % 6]` — deterministic, no randomness.
- The gold line index `[j, i]` is computed at build time (`disp.widx`), so narration, highlight
  and data always agree.

---
*Regeneration: edit `scripts/scenes/s05.js`, re-run `python3 scripts/build_video.py`,
re-upload the `s05_knobs/` folder. Data comes from `scripts/nn_build.py` (seeded → reproducible).*
