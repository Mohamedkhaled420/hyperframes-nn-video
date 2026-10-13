# s03_neuron — Chapter 2 — A single neuron

**Duration:** 60 s · **Accent:** `#5FD3BC` · **Output:** `s03_neuron/s03_neuron.mp4` (1080p landscape, 30 fps)
**Self-contained:** single `index.html` — inline CSS + engine + data + scene code, zero external assets.

**Goal:** build one neuron completely — weights, bias, weighted sum, sigmoid — with arithmetic
the viewer can follow.

### Visual beats
| t | beat |
|---|------|
| 1.0–1.7 | Three input circles (0.9, 0.2, 0.7) pop |
| 5.5–7.3 | Weighted arrows draw into the neuron (thickness ∝ |w|; blue +1.5, red −2.0, blue +0.8); weight labels fade at arrow midpoints |
| 9.5 | Neuron circle with σ pops; equation `y = σ(w₁x₁+w₂x₂+w₃x₃+b)` fades |
| 14.0–22.1 | Arithmetic row appears line by line: `0.9×1.5=1.35`, `0.2×(−2.0)=−0.40`, `0.7×0.8=0.56`, then `sum=1.51, b=−1 → z=0.51` |
| 22.8–23.6 | Output arrow + output circle "0.62" |
| 24.4–28.4 | Diagram clears; axes + sigmoid curve draw (yellow) |
| 30.6–35.8 | Red dot slides along the curve (−6 → +6, then back to z=0.51); dashed gold guides mark z=0.51, σ=0.62 |
| 41.6 / 45.0 | Teal curve (bias shift) and purple curve (steeper) draw with labels |
| 52.2 | Recap wipe: `output = σ( Σ w·x + b )` |

### Implementation notes
- Curve paths are sampled in JS (z ∈ [−6, 6], step 0.2) — plain SVG paths, draw-on via dash
  offset.
- The sliding dot is a `sync` over two phases; guides use `draw` on dashed lines.
- All numbers are constants of the scene (by construction, they match the narration).

---
*Regeneration: edit `scripts/scenes/s03.js`, re-run `python3 scripts/build_video.py`,
re-upload the `s03_neuron/` folder. Data comes from `scripts/nn_build.py` (seeded → reproducible).*
