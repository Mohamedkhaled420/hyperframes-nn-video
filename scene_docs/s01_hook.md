# s01_hook — Prologue — The problem

**Duration:** 40 s · **Accent:** `#FFE45C` · **Output:** `s01_hook/s01_hook.mp4` (1080p landscape, 30 fps)
**Self-contained:** single `index.html` — inline CSS + engine + data + scene code, zero external assets.

**Goal (hook):** make the viewer feel why hand-written rules fail, then promise a machine that
finds its own rules.

### Visual beats (seconds)
| t | beat |
|---|------|
| 0.8 | Title "How does a machine learn to read?" wipes in (stays as a header) |
| 6.0–8.2 | Eight 5×7 pixel sevens pop in, 2 rows × 4 (clean, noisy ×4, row-shifted, column-shifted, heavily noisy) |
| 8.5 | Gold line "All of these are a 7" |
| 12.4 | Dark code panel: `if top_row_bright and diagonal_down_left:` / `label = "7"` (mono, green assignment) |
| 15.6–16.6 | Red X strokes draw over sevens #2, #5, #8 (two crossed lines each, draw-on) |
| 18.0 | Red line "The next example always breaks the rule" |
| 20.3–20.9 | Sevens/panel/X fade out; 12 knobs (dials) pop in 2×6, pointers wobble via `sync` (deterministic sine of t) |
| 22.8 | "the machine finds its own rules — by turning knobs" |
| 28.4 | Giant "562 knobs" wipe (exact parameter count of the network in this video) |
| 32.2–35.0 | Six roadmap pills pop (Pixels, Neurons, Layers, Error, Descent, Backpropagation), each numbered and color-coded |
| 37.1 | "Let's build one." wipe |

### Implementation notes
- Sevens come from `DATA.sevens` (8 × 35 values) — the clean 7 plus seeded noise/roll variants.
- Knob pointers are the only continuous motion; angle = base + 28·sin(1.4t + 2.1i), a pure
  function of t, so frames are reproducible.
- All entrances are `pop` (scale-back ease) or `wipe` (clip reveal) ops; exits are `out`.
- Captions burned from `DATA.narr` (8 entries); chapter chip "Prologue · The problem".

---
*Regeneration: edit `scripts/scenes/s01.js`, re-run `python3 scripts/build_video.py`,
re-upload the `s01_hook/` folder. Data comes from `scripts/nn_build.py` (seeded → reproducible).*
