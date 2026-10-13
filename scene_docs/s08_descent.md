# s08_descent — Chapter 7 — Rolling downhill

**Duration:** 70 s · **Accent:** `#FF9F43` · **Output:** `s08_descent/s08_descent.mp4` (1080p landscape, 30 fps)
**Self-contained:** single `index.html` — inline CSS + engine + data + scene code, zero external assets.

**Goal:** gradient descent + learning rate, felt physically; then the 2-D contour view and the
update rule.

### Visual beats
| t | beat |
|---|------|
| 1.0–3.8 | Axes + parabolic cost curve draw; "the cost, as a landscape" |
| 4.6–8.0 | Gold ball pops on the slope; red tangent line ("we can feel the slope where we stand") |
| 11.6–19.1 | **η = 1.0**: five hops with teal trail dots; "step = η × slope" |
| 27.4–33.0 | **η = 0.05**: ten tiny hops, barely moves ("crawling") |
| 34.0–40.0 | **η = 5.2**: overshoots wall-to-wall (scripted bounce sequence), finally flies out ("overshooting") |
| 44.0–47.5 | Contour rings (6 tilted ellipses) draw: "rings join points of equal cost" |
| 47.6–52 | Second ball; red arrow shows the steepest-descent direction |
| 54.6–60 | Golden zigzag path draws through 9 points to the center; "562 knobs — a landscape in 562 dimensions. Same rule." |
| 62.0 | Update rule wipes in: `w ← w − η · ∂C/∂w`; "repeat, thousands of times" |

### Implementation notes
- The bowl is y = 760 − 0.0013(x−960)²; hop steps are computed from dC/dx with a visual scale
  factor S=180 — the same math the narration describes. Ball y always follows the curve.
- The η=5.2 bounce sequence is a scripted waypoint list (deterministic), ending with a fly-off
  (ball lifted off the curve with quadratic ease + fade).
- The zigzag is a hand-tuned 9-point polyline that reads as alternating overshoot around the
  valley axis.

---
*Regeneration: edit `scripts/scenes/s08.js`, re-run `python3 scripts/build_video.py`,
re-upload the `s08_descent/` folder. Data comes from `scripts/nn_build.py` (seeded → reproducible).*
