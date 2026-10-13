# VIDEO PLAN — "How does a machine learn to read?"

**Format:** 1920×1080 · 30 fps · 12 scene compositions · **total runtime 11 min 00 s (660 s)**
**Style:** Manim / 3Blue1Brown-inspired "descriptive design" — dark navy canvas (#0f141c), thin
geometric strokes, one accent color per chapter, formulas set in monospace, burned-in captions.
**Assets:** zero external files. Every pixel, grid, arrow, curve and heatmap is generated at
runtime by inline HTML/CSS/JS + SVG inside each scene's `index.html`.
**Truth:** all numbers shown on screen come from one real training run (a 35 → 12 → 10 network
trained during the build), embedded as JSON in the scenes — nothing is faked, nothing can drift.

The video answers one question — *how does a machine learn to read?* — by building a tiny
neural network that recognizes handwritten digits, from raw pixels to backpropagation, and
then honestly inspects what it actually learned.

---

## Scene-by-scene description

### s01 · Prologue — "The problem" (40 s, accent gold)
Opens on the question itself: **"How does a machine learn to read?"** Eight visibly different
handwritten sevens (generated 5×7 pixel grids — slanted, noisy, shifted) pop in one by one with
the line *"All of these are a 7."* A dark code panel then shows the naive approach — a hand-written
`if top_row_bright and diagonal_down_left` rule — and red X marks strike through three of the
sevens: *the next example always breaks the rule.* The flip: twelve knobs (dials with rotating
pointers) appear — the machine will find its own rules by turning knobs. A giant **"562 knobs"**
lands (that's the exact parameter count of the network built in this video). A six-pill roadmap
(Pixels → Neurons → Layers → Error → Descent → Backpropagation) previews the journey, and the
scene closes on *"Let's build one."*

### s02 · Chapter 1 — "Pictures are numbers" (50 s, accent blue)
A 5×7 grid of a digit 3 fades in. One pixel is boxed in yellow: *its brightness, 0 to 1.* All 35
brightness values fade in as numbers inside their cells. Then the payoff animation: every cell
flies out of the grid and stacks into a single vertical column between brackets — the input
vector **x**, *"a list of 35 numbers."* The scene scales up: a soft 28×28 blurred digit (784
numbers — like real MNIST), then *"a phone photo: 4000 × 3000 × 3 = 36,000,000 numbers."*
Closing line: **"A picture is a list of numbers."**

### s03 · Chapter 2 — "A single neuron" (60 s, accent teal)
Three input circles (0.9, 0.2, 0.7) fire weighted arrows into one neuron — arrow thickness and
color encode the weight (+1.5 blue, −2.0 red, +0.8 blue). The arithmetic runs on screen step by
step: 1.35, −0.40, 0.56 → sum 1.51, plus bias −1 → **z = 0.51**. Because raw sums are unbounded,
the scene clears and a sigmoid curve draws itself; a red dot slides along it from almost-0 to
almost-1 and settles at σ(0.51) = **0.62** with dashed guide lines. Two variants then morph in:
a shifted curve (*bias shifts it*) and a steeper one (*weights sharpen it*). Recap formula:
**output = σ( Σ w·x + b )**.

### s04 · Chapter 3 — "Layers" (55 s, accent purple)
Four columns of neurons (7 → 6 → 5 → 4) pop in and fully connect. The hoped-for story is drawn
literally: little yellow icons (a loop, a stem, a hook, a diagonal, two loops) appear inside the
"parts" neurons, and golden highlight paths show **loop + stem → 9** and **loop + loop → 8**.
A bracket under the middle columns names them *hidden layers — nobody tells them what to look
for.* An orange caveat appears — *"the real story is messier; we check it in Chapter 10"* — and
the summary wipes in: **a network is neurons in layers, joined by weights.**

### s05 · Chapter 4 — "The knobs" (45 s, accent gold)
The **real network** fades in: 35 input pixels, 12 hidden neurons, 10 outputs — with all 540
weight lines colored by the sign of their **actual trained values** (blue positive, red negative,
opacity by magnitude). One line is highlighted in gold: *one line = one weight = one knob.* The
count runs live: 35 × 12 = 420 + 12 biases; 12 × 10 = 120 + 10 biases; **420 + 12 + 120 + 10 =
562 numbers.** The network dissolves into a shimmering field of 562 dots — *not a program anyone
wrote, just 562 numbers* — with the bridge to modern LLMs (billions of knobs, same recipe) and
the cliffhanger: *how do we find good values?*

### s06 · Chapter 5 — "Running the network" (60 s, accent blue)
A full forward pass, twice over. A digit 3 enters; input neurons take its brightness; hidden
neurons light up yellow in proportion to their activation (h = σ(W₁x + b₁) on screen); outputs
light up (p = softmax(W₂h + b₂)); probability bars grow and the prediction lands: **"3 — 99%."**
Then the same 562 weights replay for a 7, a 5 and a noisy 8 — grid, activations, bars and
prediction morphing live between states. Closing thought: *no rules about loops or strokes were
written — only numbers.*

### s07 · Chapter 6 — "How wrong is it?" (50 s, accent red)
The untrained network's bars are nearly flat — ~10% everywhere, *it has no idea.* A green target
marks "all the probability on 3", and a red arrow spans the gap. The loss is defined on screen —
**loss = −ln(p of the correct digit)** — and drawn as a curve; the red dot sits high (p = 10% →
loss 2.27). The bars morph into the trained network, the dot slides down the curve turning green
(loss 0.01). Finally: *cost = the average loss over every training example* — **training =
pushing the cost down.**

### s08 · Chapter 7 — "Rolling downhill" (70 s, accent orange)
Gradient descent as a landscape. A bowl-shaped cost curve draws in; a gold ball feels the slope
(a red tangent line) and hops downhill — **step = η × slope.** Three learning rates are played
in sequence: η = 1.0 (confident hops into the valley), η = 0.05 (ten tiny crawls that barely
move), η = 5.2 (overshoot, wall to wall, until the ball flies out of the bowl). The scene then
redraws the landscape as contour rings for two knobs, shows the steepest-descent direction, and
walks a golden **zigzag path** to the center. Generalization line: *562 knobs = a landscape in
562 dimensions — same rule.* Update rule: **w ← w − η · ∂C/∂w**, repeated thousands of times.

### s09 · Chapter 8 — "Who is to blame?" (65 s, accent red)
Backpropagation by hand on a two-weight chain: x →(w₁=0.8)→ h →(w₂=−0.5)→ y, with
C = (y−1)². The forward pass runs (1 → 0.8 → −0.4, loss 1.96), then blame flows backwards in
red arrows with exact numbers: dC/dy = −2.8, **dC/dw₂ = −2.24**, dC/dh = 1.4, **dC/dw₁ = 1.4**
— *the chain rule: blame flows backwards, multiplying local slopes.* Each weight is nudged
against its slope (η = 0.1) in an update panel, a new forward pass runs, and the loss falls
**1.96 → 1.40**. Closing: *backprop does exactly this for all 562 weights — one pass forward,
one pass back, one small step.*

### s10 · Chapter 9 — "Training" (70 s, accent green)
The real training run, replayed. Two plots (cost left, accuracy right, square-root epoch axis so
the early action is visible) reveal the actual recorded curves from the build's training — train
in solid, unseen digits in dashed orange. Below, a strip of **ten digits the network has never
seen** updates at each snapshot epoch: predicted labels flip, borders turn green/red live, and a
counter tracks *epoch 22 · train 94% · unseen 90%*… ending at **100% / 100%**. The scene then
strips training to its essence — four boxes (Forward pass → Cost → Backward pass → Nudge
weights) closed by a return arrow: *repeat — millions of times in real systems.* Final line:
*nothing in this loop knows what a seven is; the knowledge ends up in the weights.*

### s11 · Chapter 10 — "What did it learn?" (55 s, accent purple)
Honesty chapter. Twelve heat-maps pop in — the **real trained weights** of every hidden neuron
over the 35 pixels (blue excites, red inhibits). If Chapter 3's story were true we'd see neat
loops and strokes; instead: *blurry, overlapping templates.* Two live tests computed from the
embedded weights: **random static** (an image of nothing) → the network confidently answers
"9, 96% sure" — *it was never taught to say 'I don't know'*; and a **blend** (four + nine)/2 →
belief splits "4 at 43%, 9 at 37%". Closing statement: **a network only knows the world it was
trained on** — understanding that gap matters as much as the math.

### s12 · Recap — "Putting it together" (40 s, accent blue)
Six numbered rows recap the whole video — pictures are numbers / a neuron: weighted sum, bias,
squash / layers joined by weights / a cost says how wrong / descent steps downhill /
backprop sends blame backwards — each with its formula. They dim and collapse into one line:
**θ ← θ − η ∇C(θ)**. The video ends with a challenge to the viewer: *change the size of the
hidden layer. See what breaks. That is how intuition is built.*

---

## Why this works as viral educational content

- **One concrete question** ("how does a machine read?") instead of a topic dump — the hook is a
  promise the whole video keeps.
- **Real numbers everywhere.** The 562 parameters, the 99% confidence, the 100%/100% final
  accuracies, the static test's 90% — all computed from an actual training run embedded in the
  pages, matching the narration word for word.
- **Manim-style visual grammar**: things assemble from parts, formulas appear next to the
  objects they describe, one accent color per chapter gives each chapter an identity.
- **An honest ending** (the messy templates, the overconfidence on static) — the beat that
  separates 3Blue1Brown-class explainers from generic AI content, and the most comment-worthy
  moment in the video.
- **A built-in call to action** (change the hidden layer, see what breaks) that drives
  engagement without asking for likes.

## Production pipeline (how the files are made)

1. `nn_build.py` — trains the 35→12→10 net (seeded, 300 epochs), records curves, snapshots,
   test predictions, static/blend results → `build/data.json`.
2. `scenes/s01.js … s12.js` — each scene's visuals as pure functions of time over that data.
3. `engine.js` — the deterministic SVG timeline runtime (fade/pop/wipe/draw/sync primitives,
   captions, chapter chip, progress bar, seek contract) inlined into every page.
4. `build_video.py` — merges shell + engine + data + scene into 12 self-contained
   `index.html` files, emits `jobs.csv`, `concat_list.txt`, `narration_script.md`.
5. Colab notebook (your existing Hyperframes batch renderer) renders each row of `jobs.csv`
   to `mp4` on the T4 (NVENC + EGL Chrome); `ffmpeg -f concat` stitches the 12 outputs.
