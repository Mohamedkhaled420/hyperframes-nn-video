# s02_pixels — Chapter 1 — Pictures are numbers

**Duration:** 50 s · **Accent:** `#58C4DD` · **Output:** `s02_pixels/s02_pixels.mp4` (1080p landscape, 30 fps)
**Self-contained:** single `index.html` — inline CSS + engine + data + scene code, zero external assets.

**Goal:** establish the video's foundation — an image is a list of numbers — visually, by
unrolling a picture into its input vector.

### Visual beats
| t | beat |
|---|------|
| 1.2 | 5×7 grid of a digit 3 fades in (34 px cells, anti-aliased values) |
| 5.5 | Yellow box draws around one pixel; "each square holds one number: 0 → 1" |
| 10.0–12.5 | All 35 brightness numbers fade in inside their cells (dark text on bright cells) |
| 17.0–18.2 | **Unroll:** every cell flies from the grid into a vertical column (staggered 28 ms), brackets draw, label "x — the input, a list of 35 numbers" |
| 22.0 | "unroll" line dims |
| 29.0 | 28×28 bilinear-blurred digit appears; "28 × 28 = 784 numbers" |
| 35.2 | "a phone photo: 4000 × 3000 × 3 = 36,000,000 numbers" |
| 42.2 | Closing wipe: "A picture is a list of numbers." |

### Implementation notes
- The unroll is a `sync` interpolator: for cell i, position = lerp(gridPos, columnPos,
  easeIO(clamp((t−17.0−0.028i)/0.75))); rect size lerps 34→16 px. Pure function of t.
- The 28×28 image (`DATA.g28`) is bilinear-upsampled from the 5×7 bitmap and contrast-stretched
  at build time — smooth, no streaks.
- Data: `DATA.dig3`, `DATA.g28`.

---
*Regeneration: edit `scripts/scenes/s02.js`, re-run `python3 scripts/build_video.py`,
re-upload the `s02_pixels/` folder. Data comes from `scripts/nn_build.py` (seeded → reproducible).*
