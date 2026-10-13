# s10_training — Chapter 9 — Training

**Duration:** 70 s · **Accent:** `#7EC96B` · **Output:** `s10_training/s10_training.mp4` (1080p landscape, 30 fps)
**Self-contained:** single `index.html` — inline CSS + engine + data + scene code, zero external assets.

**Goal:** play back the REAL training run (recorded at build time) and compress it into the
training loop.

### Visual beats
| t | beat |
|---|------|
| 1.0–2.8 | Two plot frames: cost (left), accuracy (right), √(epoch) x-axis; axis tick labels; legend "— train / – – unseen digits" |
| 2.0 | Strip of 10 unseen test digits (noisy, one per class) with grey borders |
| 8.0–48.0 | Curves reveal left→right (train solid red/blue, unseen dashed orange); at each of 15 snapshot epochs: faint vertical marker, counter updates ("epoch 22 · train 94% · unseen 90%"), and the strip's predicted labels + green/red borders update |
| 48.6 | Plots + strip fade out |
| 49.5–53 | Four loop boxes pop with arrows: Forward pass → Cost → Backward pass → Nudge weights |
| 55.4–56.6 | Orange return arrow closes the loop; "repeat — millions of times in real systems" |
| 60.8 | Closing wipe: "nothing in this loop knows what a seven is. the knowledge ends up in the weights." |

### Implementation notes
- `DATA.hist` = 300 epochs of loss/tloss/acc/tacc (4-decimal rounded); `DATA.snaps` = 15
  √-spaced snapshots with the 10 test predictions each.
- One master `sync` (t ∈ [8, 48.4]) maps t → reveal progress and finds the active snapshot;
  curves animate via stroke-dashoffset, everything else is attribute updates. Frame-exact.
- Final numbers quoted by the narration (100% / 100%) come from the same embedded history.

---
*Regeneration: edit `scripts/scenes/s10.js`, re-run `python3 scripts/build_video.py`,
re-upload the `s10_training/` folder. Data comes from `scripts/nn_build.py` (seeded → reproducible).*
