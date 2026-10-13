/* s04 — Chapter 3 · Layers (55s) */
(function(){
begin({ n:'Chapter 3', title:'Layers', color:C.purple });

const colX = [340, 760, 1180, 1600];
const counts = [7, 6, 5, 4];
const R = 26, SP = 88;
const nodes = [];   // nodes[col][i] = cy
const netG = G();

counts.forEach((n, ci) => {
  const col = [];
  const y0 = 450 - ((n - 1) / 2) * SP;
  for (let i = 0; i < n; i++) col.push(y0 + i * SP);
  nodes.push(col);
});
/* connections */
const connG = G(netG);
for (let ci = 0; ci < 3; ci++)
  nodes[ci].forEach(y1 => nodes[ci + 1].forEach(y2 => {
    line(colX[ci] + R, y1, colX[ci + 1] - R, y2, { stroke: '#33405299', w: 1.4 }, connG)
      .setAttribute('stroke', '#3a4759');
  }));
connG.style.opacity = 0;
fade(connG, 6.0, 1.6);

/* nodes */
const nodeEls = [];
counts.forEach((n, ci) => {
  nodes[ci].forEach((cy, i) => {
    const c = circle(colX[ci], cy, R, { fill: C.panel2, stroke: C.dim, w: 2 }, netG);
    pop(c, 2.0 + (ci * 0.35 + i * 0.09), 0.45);
    nodeEls.push(c);
  });
});

/* column labels */
const labels = ['pixels', 'small strokes', 'parts', 'digits'];
const labEls = labels.map((lb, ci) => {
  const t = T(lb, colX[ci], 795, { size: 32, color: C.dim });
  fade(t, 10.0 + ci * 0.3, 0.7);
  return t;
});

/* icons inside the five "parts" neurons */
const icons = [];
function iconLoop(cx, cy, g){ return el('circle', { cx, cy, r: 14, fill: 'none', stroke: C.yellow, 'stroke-width': 3.5 }, g); }
function iconStem(cx, cy, g){ return line(cx, cy - 16, cx, cy + 16, { stroke: C.yellow, w: 3.5 }, g); }
function iconHook(cx, cy, g){ return path('M' + (cx - 12) + ',' + (cy - 12) + ' L' + (cx - 12) + ',' + (cy + 6) + ' A10,10 0 0 0 ' + (cx + 8) + ',' + (cy + 6), { stroke: C.yellow, w: 3.5 }, g); }
function iconDiag(cx, cy, g){ return line(cx - 13, cy + 13, cx + 13, cy - 13, { stroke: C.yellow, w: 3.5 }, g); }
function iconTwo(cx, cy, g){
  const r = 8;
  return path('M' + (cx - r - 7) + ',' + (cy - 6) + ' a' + r + ',' + r + ' 0 1 0 ' + (2 * r) + ',0 a' + r + ',' + r + ' 0 1 0 ' + (-2 * r) + ',0 Z ' +
              'M' + (cx - r + 7) + ',' + (cy + 7) + ' a' + r + ',' + r + ' 0 1 0 ' + (2 * r) + ',0 a' + r + ',' + r + ' 0 1 0 ' + (-2 * r) + ',0 Z',
    { stroke: C.yellow, w: 3 }, g);
}
const nodeYs = [0, 1, 2, 3, 4].map(i => nodes[2][i]);
const iconFns = [iconLoop, iconStem, iconHook, iconDiag, iconTwo];
icons.push(iconFns.map((fn, i) => {
  const g = G(netG);
  const e = fn(colX[2], nodes[2][i], g);
  draw(e, 23.2 + i * 0.4, 0.6);
  return g;
}));

/* output digit labels */
const digLabels = ['4', '7', '8', '9'].map((d, i) => {
  const t = T(d, colX[3] + R + 26, nodes[3][i] + 10, { size: 32, mono: true, color: C.text, anchor: 'start' });
  fade(t, 24.0 + i * 0.2, 0.5);
  return t;
});

/* highlighted hopeful paths: loop+stem -> 9 ; loop+loop -> 8 */
const hp = G();
const h1 = line(colX[2] + R, nodes[2][0], colX[3] - R, nodes[3][3], { stroke: C.yellow, w: 5 }, hp);
const h2 = line(colX[2] + R, nodes[2][1], colX[3] - R, nodes[3][3], { stroke: C.yellow, w: 5 }, hp);
const h3 = line(colX[2] + R, nodes[2][0], colX[3] - R, nodes[3][2], { stroke: C.yellow, w: 5 }, hp);
const h4 = line(colX[2] + R, nodes[2][4], colX[3] - R, nodes[3][2], { stroke: C.yellow, w: 5 }, hp);
[h1, h2, h3, h4].forEach((e, i) => draw(e, 29.6 + i * 0.35, 0.55));

/* hidden-layer bracket */
const br = path('M' + (colX[1] - 60) + ',850 L' + (colX[1] - 60) + ',872 L' + (colX[2] + 60) + ',872 L' + (colX[2] + 60) + ',850',
  { stroke: C.dim, w: 2.5 });
draw(br, 35.0, 0.8);
const brl = T('hidden layers — nobody tells them what to look for', 960, 905, { size: 30, color: C.dim });
fade(brl, 35.6, 0.7);

/* reality note */
const note = T('the real story is messier — we check it in Chapter 10', 960, 135, { size: 34, color: C.orange });
fade(note, 41.4, 0.8);

/* summary */
[netG, br, brl, hp].forEach(e => to(e, 47.0, 0.8, { o: 0.3 }));
const sum = T('a network is neurons in layers,<br>joined by weights.', 960, 470, { size: 54, align: 'm', weight: '700' });
wipe(sum, 47.2, 1.3);

captions(DATA.narr);
progressBar(C.purple);
})();
