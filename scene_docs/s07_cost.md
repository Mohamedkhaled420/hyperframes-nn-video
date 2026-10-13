# s07_cost — Chapter 6 — How wrong is it?

**Duration:** 50 s · **Accent:** `#FC6255` · **Output:** `s07_cost/s07_cost.mp4` (1080p landscape, 30 fps)
**Self-contained:** single `index.html` — inline CSS + engine + data + scene code, zero external assets.

**Goal:** define the loss precisely and tie it to emotion — the untrained net's embarrassing
flat guess vs the trained net's confidence.

### Visual beats
| t | beat |
|---|------|
| 0.8–3.4 | Digit 3 fades in; probability bars of the UNTRAINED net (~10% flat) |
| 11.4–12.2 | Green dashed target frame around bar 3; "the target: all the probability on 3" |
| 15.5 | Red arrow marks the gap on bar 3 |
| 22.4–26.5 | `loss = −ln(p of the correct digit)`; axes + −ln curve draw on the right |
| 27.6–28.5 | Red dot pops at p=10% → "loss = 2.27" |
| 33.0–37.5 | Bars morph to the trained probabilities; the dot slides down the curve turning green; label updates live (`loss = …`) and flips anchor near the right edge |
| 39.0 / 45.0 | "cost = the average loss over every training example" · gold "training = pushing the cost down" |

### Implementation notes
- Bar values: `DATA.p_untrained` (epoch-0 weights) and `DATA.p_trained`; the dot position maps
  p → x, −ln(p) → y inside the same sync that morphs the bars.
- The loss value in the label is computed from the interpolated p each frame — it always matches
  the dot's position exactly.

---
*Regeneration: edit `scripts/scenes/s07.js`, re-run `python3 scripts/build_video.py`,
re-upload the `s07_cost/` folder. Data comes from `scripts/nn_build.py` (seeded → reproducible).*
