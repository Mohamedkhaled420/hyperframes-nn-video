# s12_outro — Recap — Putting it together

**Duration:** 40 s · **Accent:** `#58C4DD` · **Output:** `s12_outro/s12_outro.mp4` (1080p landscape, 30 fps)
**Self-contained:** single `index.html` — inline CSS + engine + data + scene code, zero external assets.

**Goal:** compress the whole video into six lines, collapse them into one update rule, and
hand the viewer a challenge.

### Visual beats
| t | beat |
|---|------|
| 1.2 / 6.2 / 11.2 / 16.2 / 21.2 / 26.2 | Six numbered rows pop (color-coded circles): pictures are numbers `[0.0, 0.9, 0.8, …]` · neuron `σ(Σ w·x + b)` · layers `35 → 12 → 10` · cost `−ln p` · descent `w ← w − η ∂C/∂w` · backprop `chain rule` |
| 30.8–32.9 | Rows dim to 0.22; big rule wipes in: `θ ← θ − η ∇C(θ)` |
| 35.2–36.3 | Rows fade; the rule glides up and shrinks |
| 36.2–39.5 | Challenge: "Change the size of the hidden layer. See what breaks." + "that is how intuition is built" |

### Implementation notes
- The rows are groups (numbered circle + text + right-aligned mono formula); the final glide is
  a single `to` op (translate −340 px + scale 0.82) — one op, no chained animations.
- The outro deliberately mirrors s01's roadmap order so the video ends where it promised.

---
*Regeneration: edit `scripts/scenes/s12.js`, re-run `python3 scripts/build_video.py`,
re-upload the `s12_outro/` folder. Data comes from `scripts/nn_build.py` (seeded → reproducible).*
