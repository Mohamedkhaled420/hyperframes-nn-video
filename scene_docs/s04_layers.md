# s04_layers — Chapter 3 — Layers

**Duration:** 55 s · **Accent:** `#B57EDC` · **Output:** `s04_layers/s04_layers.mp4` (1080p landscape, 30 fps)
**Self-contained:** single `index.html` — inline CSS + engine + data + scene code, zero external assets.

**Goal:** tell the hoped-for story of depth (strokes → parts → digits) — and plant the seed of
doubt that Chapter 10 pays off.

### Visual beats
| t | beat |
|---|------|
| 2.0–3.6 | 4 columns of neuron circles pop (7 / 6 / 5 / 4 nodes) |
| 6.0–7.6 | Full bipartite connections fade in (92 lines, faint grey) |
| 10.0–10.9 | Column labels: pixels · small strokes · parts · digits |
| 23.2–25.2 | Yellow icons draw inside the five "parts" neurons: loop, stem, hook, diagonal, two-loops |
| 24.0–24.6 | Output labels 4 7 8 9 |
| 29.6–31.5 | Gold highlight paths draw: loop+stem → 9, loop+loop → 8 |
| 35.0–35.6 | Bracket + "hidden layers — nobody tells them what to look for" |
| 41.4 | Orange caveat: "the real story is messier — we check it in Chapter 10" |
| 47.0–48.5 | Network dims to 0.3; summary wipe: "a network is neurons in layers, joined by weights." |

### Implementation notes
- Icons are tiny SVG paths/circles with `draw` on; the two-loops icon is a single two-subpath
  `<path>` so both circles draw as one stroke.
- Geometry is data-driven: column x positions, node counts and spacing are constants at the top
  of the file; all connection endpoints derive from them.

---
*Regeneration: edit `scripts/scenes/s04.js`, re-run `python3 scripts/build_video.py`,
re-upload the `s04_layers/` folder. Data comes from `scripts/nn_build.py` (seeded → reproducible).*
