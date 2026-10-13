#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gen_scene_docs.py — writes scene_docs/<scene>.md (one build/README description per scene)."""
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "download", "hyperframes_nn_video", "scene_docs")
os.makedirs(ROOT, exist_ok=True)

DOCS = {
"s01_hook": ("Prologue — The problem", 40, "#FFE45C", """
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
"""),

"s02_pixels": ("Chapter 1 — Pictures are numbers", 50, "#58C4DD", """
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
"""),

"s03_neuron": ("Chapter 2 — A single neuron", 60, "#5FD3BC", """
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
"""),

"s04_layers": ("Chapter 3 — Layers", 55, "#B57EDC", """
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
"""),

"s05_knobs": ("Chapter 4 — The knobs", 45, "#FFC53D", """
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
"""),

"s06_forward": ("Chapter 5 — Running the network", 60, "#58C4DD", """
**Goal:** a complete, legible forward pass on the trained network — then show it is the SAME
weights producing different answers for different digits.

### Visual beats
| t | beat |
|---|------|
| 1.0 | Trained network (weight-colored lines) + digit grid area + bars layout fade in |
| 5.2–6.0 | Input grid of a 3 pops; arrow into the input layer |
| 6.4 | State A engages: input neurons take pixel brightness |
| 12.0 | `h = σ(W₁x + b₁)` — hidden neurons light yellow ∝ activation |
| 24.0 | `p = softmax(W₂h + b₂)` — output neurons light blue |
| 30.2–32 | Probability bars grow with % labels; prediction "3 — 99%" (gold, mono) |
| 41.2 / 45.6 / 50.0 | Replay for 7, 5, noisy-8: grid crossfades, activations/bars/prediction morph (1.1 s blend each) |
| 55.3–57 | Everything dims to 0.15; closing wipe: "no rules about loops or strokes were written — only numbers." |

### Implementation notes
- ONE master `sync` (t ∈ [6.4, end]) drives everything from `DATA.s6` (4 states: grid, h, p,
  pred, conf for 3/7/5/noisy-8). Within each window the first 1.1 s lerps from the previous
  state — smooth morphs, zero per-frame branching.
- Bars (`bars()` helper) show % labels; the correct class is highlighted gold.
"""),

"s07_cost": ("Chapter 6 — How wrong is it?", 50, "#FC6255", """
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
"""),

"s08_descent": ("Chapter 7 — Rolling downhill", 70, "#FF9F43", """
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
"""),

"s09_backprop": ("Chapter 8 — Who is to blame?", 65, "#FC6255", """
**Goal:** backpropagation, by hand, with exact numbers — the chain rule as "blame flowing
backwards."

### Visual beats
| t | beat |
|---|------|
| 1.0 | "descent needs a slope for every knob — how do we find all 562?" |
| 5.6–8.0 | Chain x →(w₁=0.8)→ h →(w₂=−0.5)→ y with loss box `C = (y−1)²` |
| 11.4–15.5 | Forward values appear: x=1, h=0.8, y=−0.4, C=1.96 |
| 22.0–23.0 | Red arrow loss→y: `dC/dy = −2.8` |
| 27.5 | Gold: `dC/dw₂ = −2.24 (−2.8 × 0.8)` |
| 32.5–36.5 | Dashed red arrows flow backwards (dC/dh = 1.4); gold `dC/dw₁ = 1.4 (1.4 × 1)` |
| 40.0 | Orange: "blame flows backwards, multiplying local slopes — the chain rule" |
| 45.6–47.4 | Update panel: `w₂ ← −0.276`, `w₁ ← 0.66` (η = 0.1) |
| 51.2–53.3 | New forward pass: y = −0.18 (teal), C = 1.40 (green); "one nudge: −0.4 → −0.18, loss 1.96 → 1.40" |
| 56.4 | Closing wipe: "backprop does exactly this — for all 562 weights. One pass forward, one pass back, one small step." |

### Implementation notes
- All numbers are exact for the chain shown (verified by hand) — they match the narration
  verbatim; the scene is pure constant data.
- Backward arrows are dashed red with `draw`; gold gradient labels sit under their weight
  arrows; the "new" y/loss values crossfade over the old ones.
"""),

"s10_training": ("Chapter 9 — Training", 70, "#7EC96B", """
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
"""),

"s11_inside": ("Chapter 10 — What did it learn?", 55, "#B57EDC", """
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
"""),

"s12_outro": ("Recap — Putting it together", 40, "#58C4DD", """
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
"""),
}

for sid, (title, dur, accent, body) in DOCS.items():
    md = f"""# {sid} — {title}

**Duration:** {dur} s · **Accent:** `{accent}` · **Output:** `{sid}/{sid}.mp4` (1080p landscape, 30 fps)
**Self-contained:** single `index.html` — inline CSS + engine + data + scene code, zero external assets.
{body}
---
*Regeneration: edit `scripts/scenes/{sid.split('_')[0]}.js`, re-run `python3 scripts/build_video.py`,
re-upload the `{sid}/` folder. Data comes from `scripts/nn_build.py` (seeded → reproducible).*
"""
    with open(os.path.join(ROOT, sid + ".md"), "w") as f:
        f.write(md)

print("wrote", len(DOCS), "scene docs to", ROOT)
