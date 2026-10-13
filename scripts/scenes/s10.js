/* s10 — Chapter 9 · Training (70s) — plays back the REAL training run */
(function(){
begin({ n:'Chapter 9', title:'Training', color:C.green });

const H = DATA.hist, SN = DATA.snaps, TD = DATA.test_digits;
const EP = 300;
const plotsG = G();

/* plot frames */
const P1 = { x: 150, y: 170, w: 730, h: 390 }, P2 = { x: 1040, y: 170, w: 730, h: 390 };
[P1, P2].forEach((P, i) => {
  rect(P.x, P.y, P.w, P.h, { rx: 10, fill: 'rgba(255,255,255,0.02)', stroke: C.line, w: 1.5 }, plotsG);
});
T('cost', P1.x + P1.w / 2, 140, { size: 30, color: C.dim, show: true }, plotsG);
T('accuracy', P2.x + P2.w / 2, 140, { size: 30, color: C.dim, show: true }, plotsG);
T('epochs →', P1.x + P1.w / 2, P1.y + P1.h + 38, { size: 24, color: C.faint, show: true }, plotsG);
T('epochs →', P2.x + P2.w / 2, P2.y + P2.h + 38, { size: 24, color: C.faint, show: true }, plotsG);
['0', '50', '100'].forEach((s, i) => {
  T(s, P2.x - 12, P2.y + P2.h - (P2.h - 20) * (i / 2) - 8, { size: 20, color: C.faint, anchor: 'end', show: true }, plotsG);
});
['2.5', '1.25', '0'].forEach((s, i) => {
  T(s, P1.x - 12, P1.y + (P1.h - 20) * (i / 2) + 6, { size: 20, color: C.faint, anchor: 'end', show: true }, plotsG);
});
fade(plotsG, 1.0, 1.0);

const X0 = e => P1.x + 8 + Math.sqrt(e / EP) * (P1.w - 24);
function curvePath(arr, P, vmax, vmin){
  let d = '';
  for (let i = 0; i < arr.length; i++){
    const xx = P.x + 8 + Math.sqrt((i + 1) / EP) * (P.w - 24);
    const yy = P.y + P.h - 10 - (arr[i] - vmin) / (vmax - vmin) * (P.h - 20);
    d += (d ? ' L' : 'M') + xx.toFixed(1) + ',' + yy.toFixed(1);
  }
  return d;
}
const cLoss  = path(curvePath(H.loss,  P1, 2.6, 0), { stroke: C.red, w: 3.5 }, plotsG);
const cTloss = path(curvePath(H.tloss, P1, 2.6, 0), { stroke: C.orange, w: 2.5, dash: '7 6' }, plotsG);
const cAcc   = path(curvePath(H.acc,   P2, 1.05, -0.05), { stroke: C.blue, w: 3.5 }, plotsG);
const cTacc  = path(curvePath(H.tacc,  P2, 1.05, -0.05), { stroke: C.orange, w: 2.5, dash: '7 6' }, plotsG);
[cLoss, cTloss, cAcc, cTacc].forEach(c => {
  c._len = c.getTotalLength() + 2;
  c.setAttribute('stroke-dasharray', c._len);
  c.setAttribute('stroke-dashoffset', c._len);
});
/* legend */
const leg = G(plotsG);
T('— train', P1.x + 24, P1.y + 30, { size: 22, color: C.red, anchor: 'start', show: true }, leg);
T('– – unseen digits', P1.x + 110, P1.y + 30, { size: 22, color: C.orange, anchor: 'start', show: true }, leg);
fade(leg, 4.0, 0.6);

/* test-digit strip */
const stripG = G();
const cells = [];
for (let d = 0; d < 10; d++){
  const cx = 960 + (d - 4.5) * 95;
  const g = grid(cx - 27, 675, 10, 5, 7, TD[d], { gap: 1, show: true });
  stripG.appendChild(g.g);
  const border = rect(cx - 33, 669, 66, 88, { rx: 8, stroke: C.grey, w: 3 }, stripG);
  const pred = T('→ –', cx, 800, { size: 24, mono: true, color: C.faint, show: true }, stripG);
  cells.push({ g, border, pred, truth: d });
}
const stripLbl = T('ten digits it has never seen', 960, 845, { size: 26, color: C.faint });
fade(stripG, 2.0, 0.8); fade(stripLbl, 2.6, 0.7);

/* counter line */
const counter = T('', 960, 630, { size: 30, mono: true, color: C.text, show: true });

/* markers */
const marks = [];
for (let i = 0; i < 2; i++){
  const P = i === 0 ? P1 : P2;
  const m = line(0, P.y + 4, 0, P.y + P.h - 4, { stroke: '#ffffff22', w: 2 }, plotsG);
  m.style.opacity = 0;
  marks.push(m);
}

/* master playback sync: curves reveal + snapshots update strip */
const T0 = 8.0, T1 = 48.0;
function snapAt(t){
  let s = null;
  const tt = clamp((t - T0) / (T1 - T0), 0, 1);
  for (const k of SN) if (Math.sqrt(k.e / EP) <= tt + 1e-6) s = k;
  return s;
}
sync((p, t) => {
  const pr = clamp((t - T0) / (T1 - T0), 0, 1);
  [cLoss, cTloss, cAcc, cTacc].forEach(c =>
    c.setAttribute('stroke-dashoffset', (c._len * (1 - pr)).toFixed(1)));
  const s = snapAt(t);
  if (s){
    const xx = P1.x + 8 + Math.sqrt(s.e / EP) * (P1.w - 24);
    marks[0].setAttribute('x1', xx); marks[0].setAttribute('x2', xx);
    marks[1].setAttribute('x1', P2.x + 8 + Math.sqrt(s.e / EP) * (P2.w - 24));
    marks[1].setAttribute('x2', P2.x + 8 + Math.sqrt(s.e / EP) * (P2.w - 24));
    marks[0].style.opacity = 1; marks[1].style.opacity = 1;
    counter.textContent = 'epoch ' + s.e + '   ·   train ' + Math.round(s.acc * 100) +
      '%   ·   unseen ' + Math.round(s.tacc * 100) + '%';
    cells.forEach((c, d) => {
      const ok = s.preds[d] === c.truth;
      c.border.setAttribute('stroke', ok ? C.green : C.red);
      c.pred.textContent = '→ ' + s.preds[d];
      c.pred.setAttribute('fill', ok ? C.green : C.red);
    });
  } else {
    counter.textContent = 'epoch 0   ·   random weights';
    counter.setAttribute('fill', C.dim);
  }
  if (t >= T0) counter.setAttribute('fill', C.text);
}, T0, 48.4);

/* --- the loop, abstracted ------------------------------------------------ */
const loopG = G();
const boxW = 330, boxH = 104, boxY = 400;
const items = ['Forward pass', 'Cost', 'Backward pass', 'Nudge weights'];
const itemCols = [C.blue, C.yellow, C.red, C.green];
const boxes = items.map((it, i) => {
  const bx = 140 + i * 460 + boxW / 2;
  const g = G(loopG);
  rect(bx - boxW / 2, boxY, boxW, boxH, { rx: 14, fill: C.panel, stroke: itemCols[i], w: 2.5 }, g);
  T(it, bx, boxY + boxH / 2 + 11, { size: 31, show: true }, g);
  pop(g, 49.5 + i * 0.65, 0.5);
  return g;
});
for (let i = 0; i < 3; i++){
  const x1 = 140 + i * 460 + boxW + 8, x2 = 140 + (i + 1) * 460 - 8;
  const a = arrow(x1, boxY + boxH / 2, x2, boxY + boxH / 2, { stroke: C.dim, w: 3 }, loopG);
  draw(a, 50.3 + i * 0.65, 0.4);
}
const ret = path('M' + (140 + 3 * 460 + boxW / 2) + ',' + (boxY + boxH + 6) +
  ' L' + (140 + 3 * 460 + boxW / 2) + ',590 L' + (140 + boxW / 2) + ',590 L' + (140 + boxW / 2) + ',' + (boxY + boxH + 12),
  { stroke: C.orange, w: 3.5 });
draw(ret, 55.4, 1.0);
const repL = T('repeat — millions of times in real systems', 960, 575, { size: 30, color: C.orange });
fade(repL, 56.6, 0.7);

/* closing */
[plotsG, stripG, stripLbl, counter, ...marks].forEach(e => out(e, 48.6, 0.6));
const fin = T('nothing in this loop knows what a seven is.<br>the knowledge ends up in the weights.',
  960, 330, { size: 48, weight: '700' });
to(loopG, 60.4, 0.7, { o: 0.3 }); to(repL, 60.4, 0.5, { o: 0.15 });
wipe(fin, 60.8, 1.4);

captions(DATA.narr);
progressBar(C.green);
})();
