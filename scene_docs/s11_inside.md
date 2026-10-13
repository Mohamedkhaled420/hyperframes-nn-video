# s11_inside — Chapter 10 — What did it learn?

**Duration:** 55 s · **Accent:** `#B57EDC` · **Output:** `s11_inside/s11_inside.mp4` (1080p landscape, 30 fps)
**Self-contained:** single `index.html` — inline CSS + engine + data + scene code, zero external assets.

**Goal:** inspect the weights honestly — messy templates, overconfidence on nonsense — the
video's most distinctive chapter.

### Visual beats
| t | beat |
|---|------|
| 1.0–6.3 | Twelve 5×7 heat-maps pop in (real W₁ rows): blue = excites, red = inhibits, opacity = strength; "neuron 1..12" labels |
| 6.5 | Legend (blue/red swatches) |
| 17.0 | Orange verdict: "not tidy loops and strokes — blurry, overlapping templates" |
| 27.5 | Heat-maps dim to 0.12 |
| 28.2–34 | **Test 1:** seeded random static grid + "random static"; bars grow from embedded probabilities; result "static → 9, 96% sure" (gold); "it was never taught to say 'I don't know'" |
| 38.3–42.6 | **Test 2:** grids `4 + 9 = blend`; bars morph to the blend's probabilities; "its belief splits: 4 at 43%, 9 at 37%" |
| 44.8–51 | All dims; closing wipe: "A network only knows the world it was trained on." + sub-line |

### Implementation notes
- Heat-maps: `heat()` helper maps each weight to blue/red with opacity 0.18+0.82·|w|/max|W₁|.
- The static grid, its probability vector and the blend results are precomputed at build time
  (seeded 600-sample search) and embedded — the "live test" is deterministic and identical in
  every render.

---
*Regeneration: edit `scripts/scenes/s11.js`, re-run `python3 scripts/build_video.py`,
re-upload the `s11_inside/` folder. Data comes from `scripts/nn_build.py` (seeded → reproducible).*
