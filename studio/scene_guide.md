# Hyperframes scene-authoring guide (for AI scene writers)

You write the **scene body** for one chapter of an educational video. The body is a
small JavaScript program that runs inside a ready-made deterministic SVG engine.
The engine, HTML shell, captions, and player integration are handled for you —
you only choreograph what is on screen, second by second.

## The stage

- Canvas: SVG, **1920 × 1080**, dark theme (`#0f141c` background, drawn for you).
- Safe margins: keep content between x=90..1830, y=120..880. The bottom band
  (y>890) is reserved for captions; the top-left 250×90 px is the chapter chip.
- Everything scales automatically; you always work in 1920×1080 coordinates.

## Palette (use `C.<name>` — do not invent hex codes)

```js
C.bg #0f141c   C.panel #161d29  C.panel2 #1a2230  C.line #2a3342
C.text #E8EDF4 C.dim #93A1B3    C.faint #5A6675   C.grey #4E5A68
C.blue #58C4DD C.teal #5FD3BC   C.green #7EC96B   C.yellow #FFE45C
C.orange #FF9F43  C.red #FC6255  C.purple #B57EDC  C.gold #FFC53D
```

## Building blocks (all return the SVG element; `parent` is optional)

```js
G(parent)                          // <g> group — animate groups, not loose parts
T(html, x, y, o, parent)           // text. o: {size, color, anchor:'m'|'l'|'r',
                                   //   mono, weight:'400'|'700', ls, show:true}
                                   //   '<br>' makes a new line. hidden until animated
                                   //   unless o.show = true
stext(html, x, y, o)               // text with default size 30
rect(x, y, w, h, o, parent)        // o: {fill, stroke, w (stroke-width), rx, dash}
circle(cx, cy, r, o, parent)       // o: {fill, stroke, w}
line(x1, y1, x2, y2, o, parent)    // o: {stroke, w, dash}
path(d, o, parent)                 // o: {stroke, w, fill, dash}
arrow(x1, y1, x2, y2, o, parent)   // line with arrowhead; o: {stroke, w, dash, sh}
grid(x, y, cell, cols, rows, data, o)  // 0..1 pixel grid; returns {g, cells, ...}
heat(x, y, cell, cols, rows, data, o)  // blue=positive / red=negative grid
bars(x, y, w, h, o)                // 10 probability bars; api: .set(values[10]),
                                   //   .highlight(i, color) — returns api object
```

Text sizes that fit the canvas: titles 64–84, section headers 44–52, body 30–38,
labels 24–28. Bold key numbers with `weight:'700'` and an accent color.

## Animation (deterministic — every op replays identically at any t)

```js
fade(e, t0, dur, {y: 12})   // fade in, rising y px
pop(e, t0, dur)             // springy scale-in
wipe(e, t0, dur)            // left-to-right reveal (text, formulas)
out(e, t0, dur)             // fade out
to(e, t0, dur, {o,x,y,s})   // tween opacity / x / y / scale to target
draw(e, t0, dur)            // stroke-draw a path/line/arrow
tween(obj, key, t0, t1, v0, v1, ease)  // numeric storyboard (see below)
sync((p, t) => {...}, t0, t1)          // custom per-frame code, p: 0→1
```

Easing helpers: `easeIO`, `easeOutC`, `easeBack`; math: `clamp`, `lerp`, `lerpA`.

`t0`/`dur` are **seconds**. Elements start hidden (opacity 0) unless `show:true`.
An element may have several ops; later ops continue from earlier ones.

## Custom motion with sync + tween

For anything the ops can't express (moving dots, growing curves, counters):

```js
const pos = { x: 300 };                       // mutable storyboard state
tween(pos, 'x', 2, 6, 300, 900, easeIO);      // x: 300→900 between t=2s and 6s
sync((p, t) => { dot.setAttribute('cx', pos.x); }, 0, DUR);  // repaint every frame
```

`sync` callbacks must be pure: derive everything from `p`/`t`, never accumulate.

## Required calls (the assembly checks for them)

```js
begin({ n: 'Chapter 1', title: 'Your title', color: C.blue });  // chapter chip
captions(DATA.narr);                                            // burned-in captions
progressBar(C.blue);                                            // bottom progress bar
```

`DATA.narr` is the narration/caption script: `[[start, windowSecs, text], ...]` —
**sync your visuals to these windows**: the thing being said should pop in when
its line starts.

## Hard rules

1. **Deterministic only.** No `Math.random`, `Date.now`, `setInterval`,
   `requestAnimationFrame`, `fetch`, `localStorage`, `eval`, `import`, external
   URLs, images, or fonts. Everything is a pure function of time.
2. Wrap the whole body in one IIFE: `(function(){ ... })();`
3. Use only the helpers above + plain JS (`const`, `let`, loops, arrays, math).
   No DOM APIs beyond what helpers provide, no CSS, no event listeners.
4. **Never redeclare or shadow the engine's own names** — they are already
   defined and redeclaring them throws (TDZ):
   `el G T stext rect circle line path arrow grid heat bars fade pop wipe out
   to draw tween sync reg lerp lerpA clamp easeIO easeOutC easeBack wrapText
   captions begin progressBar svg DUR C OPS SYNCS STATES`.
   Need a variable for an arrow element? Call it `arrowUp`, `a1`, `flow1`…
5. All strings must be valid JS string literals — hex colors go inside quotes
   (`color: C.gold` or `color: '#FFC53D'`, never `color: #FFC53D`).
6. Keep code ≤ 150 lines; prefer groups (`G()`) animated with one op each.
7. Numbers in the story must match the narration. Show figures/units on screen.
8. Leave y > 890 free (captions) and the top-left 250×90 free (chapter chip).
9. Plan motion so something visible changes every 2–4 seconds — no static frames.
