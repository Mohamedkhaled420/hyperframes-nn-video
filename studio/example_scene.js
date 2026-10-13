/* s12 — Recap · Putting it together (40s) */
(function(){
begin({ n:'Recap', title:'Putting it together', color:C.blue });

const rows = [
  ['A picture is a list of numbers',        '[ 0.0, 0.9, 0.8, … ]'],
  ['A neuron: weighted sum, bias, squash',  'σ( Σ w·x + b )'],
  ['Layers of neurons, joined by weights',  '35 → 12 → 10'],
  ['A cost says how wrong we are',          '− ln p'],
  ['Gradient descent: step downhill',       'w ← w − η ∂C/∂w'],
  ['Backpropagation: blame, backwards',     'chain rule']
];
const pal = [C.blue, C.teal, C.green, C.yellow, C.orange, C.red];
const times = [1.2, 6.2, 11.2, 16.2, 21.2, 26.2];
const rowEls = [];
rows.forEach((r, i) => {
  const y = 195 + i * 105;
  const g = G();
  circle(250, y, 28, { stroke: pal[i], w: 4, fill: C.panel2 }, g);
  T(String(i + 1), 250, y + 11, { size: 30, color: pal[i], mono: true, show: true }, g);
  const t1 = T(r[0], 320, y + 12, { size: 38, anchor: 'start', show: true }, g);
  const t2 = T(r[1], 1660, y + 10, { size: 34, mono: true, color: pal[i], anchor: 'end', show: true }, g);
  pop(g, times[i], 0.55);
  fade(t1, times[i] + 0.15, 0.55, { y: 10 });
  fade(t2, times[i] + 0.35, 0.55);
  rowEls.push(g, t1, t2);
});

/* collapse to one rule */
rowEls.forEach(e => to(e, 30.8, 0.6, { o: 0.22 }));
const fm = T('θ  ←  θ − η ∇C(θ)', 960, 880, { size: 80, mono: true, weight: '700' });
wipe(fm, 31.4, 1.5);

/* challenge */
rowEls.forEach(e => out(e, 35.2, 0.5));
to(fm, 35.4, 0.9, { y: -340, s: 0.82 });
const ch = T('Change the size of the hidden layer.<br>See what breaks.', 960, 660, { size: 56, weight: '700' });
wipe(ch, 36.2, 1.4);
const sub = T('that is how intuition is built', 960, 810, { size: 36, color: C.dim });
fade(sub, 38.0, 0.7);

captions(DATA.narr);
progressBar(C.blue);
})();
