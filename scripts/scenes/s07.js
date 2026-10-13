/* s07 — Chapter 6 · How wrong is it? (50s) */
(function(){
begin({ n:'Chapter 6', title:'How wrong is it?', color:C.red });

const pu = DATA.p_untrained, pt = DATA.p_trained;
/* left: the digit */
const g3 = grid(240, 300, 16, 5, 7, DATA.dig3, { gap: 1 });
fade(g3.g, 0.8, 0.8);
const gl = T('show it a 3', 296, 270, { size: 26, color: C.dim });
fade(gl, 1.6, 0.6);

/* middle: probability bars */
const BR = bars(560, 620, 500, 300, { gap: 12, vsize: 20, lsize: 22, color: C.blue });
BR.set(pu);
BR.g.style.opacity = 0;
fade(BR.g, 2.2, 0.8);
const bl = T('the untrained network', 810, 690, { size: 28, color: C.dim });
fade(bl, 3.4, 0.7);

/* target marker on digit 3 */
const n = 10, gap = 12, bw = (500 - 9 * gap) / n;
const b3x = 560 + 3 * (bw + gap);
const tgt = rect(b3x - 4, 620 - 304, bw + 8, 308, { rx: 6, stroke: C.green, w: 3, dash: '8 7' });
draw(tgt, 11.4, 0.8);
const tgtL = T('the target: all the probability on 3', 810, 250, { size: 30, color: C.green });
fade(tgtL, 12.0, 0.7);
const gapArr = arrow(b3x + bw / 2, 620 - pu[3] * 300 - 14, b3x + bw / 2, 340, { stroke: C.red, w: 4 });
draw(gapArr, 15.5, 0.6);

/* right: -ln(p) curve */
const CX0 = 1150, CX1 = 1750, CY0 = 300, CY1 = 700;
const axes = path('M' + CX0 + ',' + (CY0 - 20) + ' L' + CX0 + ',' + CY1 + ' L' + (CX1 + 16) + ',' + CY1,
  { stroke: C.grey, w: 3 });
const fx = p => CX0 + (p - 0.02) / 0.98 * (CX1 - CX0);
const fy = l => CY1 - Math.min(l, 4.2) / 4.2 * (CY1 - CY0 - 10);
let d = '';
for (let p = 1; p >= 0.02; p -= 0.01)
  d += (d ? ' L' : 'M') + fx(p).toFixed(1) + ',' + fy(-Math.log(p)).toFixed(1);
const curve = path(d, { stroke: C.yellow, w: 5 });
const fEq = T('loss = − ln( p of the correct digit )', 960, 130, { size: 38, mono: true, color: C.text });
fade(fEq, 22.4, 0.7);
draw(axes, 22.6, 0.7); draw(curve, 23.3, 2.0);
const ax1 = T('p  (probability on the right answer)', (CX0 + CX1) / 2, 745, { size: 26, color: C.dim });
const ax2 = T('loss', CX0 - 18, 296, { size: 26, color: C.dim, anchor: 'end' });
fade(ax1, 24.6, 0.6); fade(ax2, 24.8, 0.6);

/* red dot at untrained loss */
const p0 = pu[3], l0 = -Math.log(p0);
const dot = circle(fx(p0), fy(l0), 12, { fill: C.red });
pop(dot, 27.6, 0.5);
const dotL = T('', fx(p0) + 24, fy(l0) - 18, { size: 28, mono: true, color: C.red, anchor: 'start' });
fade(dotL, 28.0, 0.5);

/* morph to trained: bars rise, dot slides down and turns green */
const p1 = pt[3], l1 = -Math.log(p1);
sync((p, t) => {
  const e = easeIO(p);
  BR.set(lerpA(pu, pt, e));
  const pv = lerp(p0, p1, e);
  const lv = lerp(l0, l1, e);
  dot.setAttribute('cx', fx(pv));
  dot.setAttribute('cy', fy(lv));
  dot.setAttribute('fill', pv > 0.55 ? C.green : C.red);
  const nearEdge = fx(pv) > 1560;
  dotL.setAttribute('x', fx(pv) + (nearEdge ? -22 : 24));
  dotL.setAttribute('text-anchor', nearEdge ? 'end' : 'start');
  dotL.setAttribute('y', fy(lv) - (nearEdge ? 26 : 18));
  dotL.setAttribute('fill', pv > 0.55 ? C.green : C.red);
  dotL.textContent = 'loss = ' + lv.toFixed(2);
}, 33.0, 37.5);
const bl2 = T('the trained network', 810, 690, { size: 28, color: C.dim });
to(bl, 33.4, 0.4, { o: 0 }); fade(bl2, 33.8, 0.5);

/* averaging + final */
const avg = T('cost = the average loss over every training example', 960, 800, { size: 32, color: C.dim });
fade(avg, 39.0, 0.7);
const fin = T('training = pushing the cost down', 680, 205, { size: 42, weight: '700', color: C.gold });
fade(fin, 45.0, 0.8);

captions(DATA.narr);
progressBar(C.red);
})();
