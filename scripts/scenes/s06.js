/* s06 — Chapter 5 · Running the network (60s) */
(function(){
begin({ n:'Chapter 5', title:'Running the network', color:C.blue });

const net = DATA.net, states = DATA.s6;
/* layout */
const GX = 200, GY = 380, GC = 15, GG = 1;                  /* digit grid */
const IX = 480, IY = 460 - 34, IC = 8, IGP = 2;             /* input mini-grid */
const HX = 930, HSP = 48, HY0 = 460 - 5.5 * HSP, HR = 11;
const OX = 1330, OSP = 54, OY0 = 460 - 4.5 * OSP, OR = 11;

const stage = G();
const hys = [], oys = [], ipts = [];
for (let i = 0; i < 12; i++) hys.push(HY0 + i * HSP);
for (let i = 0; i < 10; i++) oys.push(OY0 + i * OSP);
for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++)
  ipts.push({ x: IX + c * (IC + IGP) + IC / 2, y: IY + r * (IC + IGP) + IC / 2 });

const w1g = G(stage), w2g = G(stage);
net.W1.forEach((row, j) => row.forEach((w, i) => {
  line(ipts[i].x, ipts[i].y, HX - HR, hys[j],
    { stroke: w >= 0 ? C.blue : C.red, w: 1 }, w1g)
    .setAttribute('opacity', Math.min(0.7, 0.08 + Math.abs(w) / 2.4).toFixed(2));
}));
net.W2.forEach((row, j) => row.forEach((w, i) => {
  line(HX + HR, hys[i], OX - OR, oys[j],
    { stroke: w >= 0 ? C.blue : C.red, w: 1 }, w2g)
    .setAttribute('opacity', Math.min(0.7, 0.08 + Math.abs(w) / 2.4).toFixed(2));
}));
const inNodes = ipts.map(p => rect(p.x - 4.5, p.y - 4.5, 9, 9, { rx: 2, fill: '#3d4a5c' }, stage));
const hNodes = hys.map(cy => circle(HX, cy, HR, { fill: C.panel2, stroke: C.dim, w: 1.6 }, stage));
const oNodes = oys.map(cy => circle(OX, cy, OR, { fill: C.panel2, stroke: C.dim, w: 1.6 }, stage));

fade(stage, 1.0, 1.2);
const cap = T('watch a trained network work', 960, 880, { size: 32, color: C.dim });
fade(cap, 1.8, 0.7);

/* digit grids (one per walkthrough digit), crossfaded by the master sync */
const digGrids = states.map(st => grid(GX, GY, GC, 5, 7, st.grid, { gap: GG }));
fade(digGrids[0].g, 5.2, 0.6);
const inArr = arrow(GX + 5 * 16 + 12, GY + 3.5 * 16, IX - 20, 460, { stroke: C.grey, w: 2.5 });
draw(inArr, 5.4, 0.6);
const inLbl = T('input', GX + 39, GY - 26, { size: 26, color: C.dim });
fade(inLbl, 5.4, 0.6);

/* formulas */
const f1 = T('h = σ( W₁x + b₁ )', HX, 118, { size: 34, mono: true, color: C.yellow });
fade(f1, 12.0, 0.7);
const f2 = T('p = softmax( W₂h + b₂ )', OX - 60, 164, { size: 30, mono: true, color: C.teal });
fade(f2, 24.0, 0.7);

/* bars */
const BR = bars(1500, 610, 360, 260, { gap: 9, vsize: 20, lsize: 22, color: C.blue });
fade(BR.g, 30.2, 0.6);

/* prediction text */
const confLbl = T('prediction', 1680, 700, { size: 24, color: C.dim });
fade(confLbl, 35.0, 0.6);
const predT = T('', 1680, 752, { size: 42, mono: true, color: C.gold, weight: '700' });
fade(predT, 35.0, 0.6);

/* master sync: drives grid crossfade, neuron fills and bars through 4 states */
const starts = [6.4, 41.2, 45.6, 50.0], blendWin = 1.1;
function stateAt(t){
  let k = 0;
  for (let i = 0; i < starts.length; i++) if (t >= starts[i]) k = i;
  return k;
}
sync((p, t) => {
  const k = stateAt(t), kPrev = Math.max(0, k - 1);
  const mix = k === 0 ? 1 : easeIO(clamp((t - starts[k]) / blendWin, 0, 1));
  const A = states[kPrev], B = states[k];
  const dimF = t < 55.3 ? 1 : lerp(1, 0.15, easeIO(clamp((t - 55.3) / 0.7, 0, 1)));
  digGrids.forEach((g, gi) => {
    let o = 0;
    if (gi === k) o = k === 0 ? 1 : Math.min(1, mix * 1.3);
    else if (gi === kPrev && mix < 1) o = Math.max(0, 1 - mix * 1.4);
    g.g.style.opacity = (o * dimF).toFixed(3);
  });
  inNodes.forEach((rc, i) => {
    const v = lerp(A.grid[i], B.grid[i], mix);
    rc.setAttribute('fill', 'rgba(232,237,244,' + v.toFixed(3) + ')');
  });
  hNodes.forEach((c, i) => {
    const v = lerp(A.h[i], B.h[i], mix);
    c.setAttribute('fill', 'rgba(255,228,92,' + (0.06 + 0.94 * v).toFixed(3) + ')');
  });
  oNodes.forEach((c, i) => {
    const v = lerp(A.p[i], B.p[i], mix);
    c.setAttribute('fill', 'rgba(88,196,221,' + (0.06 + 0.94 * v).toFixed(3) + ')');
  });
  BR.set(lerpA(A.p, B.p, mix));
  BR.highlight(states[k].pred, C.gold);
  predT.textContent = states[k].label + ' — ' + states[k].conf.toFixed(0) + '%';
}, 6.4, DUR);

/* closing dim for fold-driven elements */
const close = T('no rules about loops or strokes were written —<br>only numbers.', 960, 440, { size: 50, weight: '700' });
to(stage, 55.3, 0.7, { o: 0.18 });
to(f1, 55.3, 0.5, { o: 0.1 }); to(f2, 55.3, 0.5, { o: 0.1 });
to(BR.g, 55.3, 0.7, { o: 0.15 }); to(predT, 55.3, 0.5, { o: 0.1 }); to(confLbl, 55.3, 0.5, { o: 0.1 });
to(cap, 55.3, 0.5, { o: 0.1 });
wipe(close, 55.6, 1.3);

captions(DATA.narr);
progressBar(C.blue);
})();
