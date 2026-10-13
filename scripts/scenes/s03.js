/* s03 — Chapter 2 · A single neuron (60s) */
(function(){
begin({ n:'Chapter 2', title:'A single neuron', color:C.teal });

/* --- diagram -------------------------------------------------------------- */
const inX = 330, ny = 460, nx = 960;
const vals = [0.9, 0.2, 0.7], wys = [300, 460, 620];
const weights = [
  { w: '+1.5', col: C.blue, lw: 8 },
  { w: '−2.0', col: C.red,  lw: 10 },
  { w: '+0.8', col: C.blue, lw: 5 }
];
const diag = G();
const ins = [], arrs = [], wlabs = [];
vals.forEach((v, i) => {
  const c = circle(inX, wys[i], 44, { fill: C.panel2, stroke: C.line, w: 2 }, diag);
  const t = T(v.toFixed(1), inX, wys[i] + 12, { size: 38, mono: true, show: true }, diag);
  ins.push({ c, t });
  pop(c, 1.0 + i * 0.25, 0.5); pop(t, 1.15 + i * 0.25, 0.5);
});
weights.forEach((wc, i) => {
  const a = arrow(inX + 50, wys[i] + (ny - wys[i]) * 0.12, nx - 62, ny + (wys[i] - ny) * 0.14,
    { stroke: wc.col, w: wc.lw }, diag);
  arrs.push(a);
  draw(a, 5.5 + i * 0.6, 0.55);
  const mx = (inX + 50 + nx - 62) / 2, my = (wys[i] + ny) / 2 - 34;
  const wl = T(wc.w, mx, my, { size: 30, mono: true, color: wc.col, show: true }, diag);
  wlabs.push(wl);
  fade(wl, 6.6 + i * 0.6, 0.5);
});
const neu = circle(nx, ny, 74, { fill: C.panel, stroke: C.teal, w: 4 }, diag);
const sig = T('σ', nx, ny + 22, { size: 66, color: C.teal, show: true }, diag);
pop(neu, 9.5, 0.6); pop(sig, 9.7, 0.6);
const eq = T('y = σ( w₁x₁ + w₂x₂ + w₃x₃ + b )', 960, 130, { size: 40, mono: true });
fade(eq, 10.6, 0.9);

/* arithmetic row */
const prods = [
  T('0.9 × 1.5  =  1.35', 480, 770, { size: 32, mono: true }),
  T('0.2 × (−2.0)  =  −0.40', 960, 770, { size: 32, mono: true }),
  T('0.7 × 0.8  =  0.56', 1440, 770, { size: 32, mono: true })
];
prods.forEach((t, i) => fade(t, 14.0 + i * 3.0, 0.5));
const sumL = T('sum = 1.51      b = −1      →   z = 0.51', 960, 850, { size: 34, mono: true, color: C.yellow });
fade(sumL, 21.5, 0.6);
const outArr = arrow(nx + 80, ny, 1180, ny, { stroke: C.teal, w: 6 }, diag);
draw(outArr, 22.8, 0.5);
const outC = circle(1250, ny, 42, { fill: C.panel2, stroke: C.teal, w: 3 }, diag);
const outT = T('0.62', 1250, ny + 12, { size: 36, mono: true, color: C.teal, show: true }, diag);
pop(outC, 23.2, 0.5); pop(outT, 23.35, 0.5);
const outL = T('output', 1250, ny + 90, { size: 26, color: C.dim, show: true }, diag);
fade(outL, 23.6, 0.5);

const diagram = [diag, eq].concat(prods, [sumL]);
out(diag, 23.9, 0.6); out(eq, 23.9, 0.6);
prods.forEach(t => out(t, 23.9, 0.6)); out(sumL, 23.9, 0.6);

/* --- sigmoid curve --------------------------------------------------------- */
const AX0 = 500, AX1 = 1500, AY0 = 300, AY1 = 800;
const ax = path('M' + AX0 + ',' + (AY0 - 20) + ' L' + AX0 + ',' + AY1 + ' L' + (AX1 + 20) + ',' + AY1,
  { stroke: C.grey, w: 3 });
draw(ax, 24.4, 0.8);
function XZ(z){ return AX0 + (z + 6) / 12 * (AX1 - AX0); }
function YV(v){ return AY1 - v * (AY1 - AY0); }
let d = '';
for (let z = -6; z <= 6.001; z += 0.2)
  d += (d ? ' L' : 'M') + XZ(z).toFixed(1) + ',' + YV(1 / (1 + Math.exp(-z))).toFixed(1);
const curve = path(d, { stroke: C.yellow, w: 5 });
draw(curve, 25.2, 2.2);
const axl1 = T('z  (the weighted sum)', (AX0 + AX1) / 2, 855, { size: 30, color: C.dim });
const axl2 = T('σ(z)', 448, 320, { size: 30, color: C.dim, anchor: 'end' });
const zl0 = T('0', AX0 - 14, AY1 + 8, { size: 26, color: C.faint, anchor: 'end', show: true });
const zl1 = T('1', AX0 - 14, YV(1) + 8, { size: 26, color: C.faint, anchor: 'end', show: true });
fade(axl1, 26.2, 0.6); fade(axl2, 26.4, 0.6); fade(zl0, 26.6, 0.5); fade(zl1, 26.6, 0.5);

/* sliding dot */
const dot = circle(XZ(-6), YV(0.0025), 13, { fill: C.red });
dot.style.opacity = 0;
sync((p, t) => {
  dot.style.opacity = 1;
  let z;
  if (t < 33.6) z = lerp(-6, 6, easeIO(p));
  else z = lerp(6, 0.51, easeIO(clamp((t - 33.6) / 2.2, 0, 1)));
  dot.setAttribute('cx', XZ(z));
  dot.setAttribute('cy', YV(1 / (1 + Math.exp(-z))));
}, 30.6, 35.8);
const slideL = T('very negative → almost 0   ·   very positive → almost 1', 960, 200, { size: 32, color: C.dim });
fade(slideL, 30.8, 0.7);

/* dashed guides at z = 0.51 */
const zx = XZ(0.51), zy = YV(0.625);
const gd1 = line(AX0, zy, zx, zy, { stroke: C.gold, w: 2, dash: '7 7' });
const gd2 = line(zx, AY1, zx, zy, { stroke: C.gold, w: 2, dash: '7 7' });
draw(gd1, 38.2, 0.5); draw(gd2, 38.45, 0.5);
const gl1 = T('z = 0.51', zx, AY1 + 40, { size: 28, mono: true, color: C.gold });
const gl2 = T('σ = 0.62', AX0 + 14, zy - 16, { size: 28, mono: true, color: C.gold, anchor: 'start' });
fade(gl1, 38.7, 0.6); fade(gl2, 38.9, 0.6);

/* bias shifts / weights sharpen */
function sigPath(shift, k, col){
  let dd = '';
  for (let z = -6; z <= 6.001; z += 0.2)
    dd += (dd ? ' L' : 'M') + XZ(z).toFixed(1) + ',' + YV(1 / (1 + Math.exp(-k * (z - shift)))).toFixed(1);
  return path(dd, { stroke: col, w: 4 });
}
const c2 = sigPath(1.3, 1, C.teal);  draw(c2, 41.6, 1.4);
const c3 = sigPath(0, 3, C.purple); draw(c3, 45.0, 1.4);
const c2l = T('bias shifts the curve', XZ(-3.4), 250, { size: 28, color: C.teal });
const c3l = T('weights sharpen it', XZ(3.6), 250, { size: 28, color: C.purple });
fade(c2l, 43.0, 0.6); fade(c3l, 46.4, 0.6);

[ax, curve, dot, slideL, gd1, gd2, gl1, gl2, c2, c3, c2l, c3l, axl1, axl2, zl0, zl1]
  .forEach(e => out(e, 51.6, 0.5));

const rec = T('output = σ( Σ w·x  +  b )', 960, 480, { size: 62, mono: true, weight: '700' });
wipe(rec, 52.2, 1.4);

captions(DATA.narr);
progressBar(C.teal);
})();
