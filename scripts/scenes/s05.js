/* s05 — Chapter 4 · The knobs (45s) */
(function(){
begin({ n:'Chapter 4', title:'The knobs', color:C.gold });

const net = DATA.net;
/* layout */
const IX = 230, IY = 350, IC = 13, IGP = 3;          /* input mini-grid 5x7 */
const HX = 950, HY0 = 460 - 5.5 * 64, HSP = 64, HR = 14;
const OX = 1640, OY0 = 460 - 4.5 * 70, OSP = 70, OR = 14;

const netG = G();
const hys = [], oys = [], ipts = [];
for (let i = 0; i < 12; i++) hys.push(HY0 + i * HSP);
for (let i = 0; i < 10; i++) oys.push(OY0 + i * OSP);
for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++)
  ipts.push({ x: IX + c * (IC + IGP) + IC / 2, y: IY + r * (IC + IGP) + IC / 2 });

/* weight lines W1 + W2 */
const w1g = G(netG), w2g = G(netG);
net.W1.forEach((row, j) => row.forEach((w, i) => {
  line(ipts[i].x, ipts[i].y, HX - HR, hys[j],
    { stroke: w >= 0 ? C.blue : C.red, w: 1.2, dash: null }, w1g)
    .setAttribute('opacity', Math.min(0.85, 0.12 + Math.abs(w) / 2.0).toFixed(2));
}));
net.W2.forEach((row, j) => row.forEach((w, i) => {
  line(HX + HR, hys[i], OX - OR, oys[j],
    { stroke: w >= 0 ? C.blue : C.red, w: 1.2 }, w2g)
    .setAttribute('opacity', Math.min(0.85, 0.12 + Math.abs(w) / 2.0).toFixed(2));
}));

/* nodes */
const nEls = [];
ipts.forEach((p, i) => {
  const rc = rect(p.x - 5, p.y - 5, 10, 10, { rx: 2, fill: '#3d4a5c' }, netG);
  nEls.push(rc);
});
hys.forEach(cy => nEls.push(circle(HX, cy, HR, { fill: C.panel2, stroke: C.dim, w: 2 }, netG)));
oys.forEach(cy => nEls.push(circle(OX, cy, OR, fillC => 0, netG)));
oys.forEach((cy, i) => {
  const c = circle(OX, cy, OR, { fill: C.panel2, stroke: C.dim, w: 2 }, netG);
  nEls.push(c);
});
fade(netG, 1.0, 1.4);
const capNet = T('the real network:  35 pixels in → 12 hidden → 10 digits out', 960, 880, { size: 32, color: C.dim });
fade(capNet, 2.2, 0.8);

/* gold weight highlight */
const [wj, wi] = DATA.disp.widx;
const pIn = ipts[wi], hy = hys[wj];
const goldL = line(pIn.x, pIn.y, HX - HR, hy, { stroke: C.gold, w: 5 });
pop(goldL, 6.0, 0.6);
const goldT = T('one line = one weight = one knob', (pIn.x + HX) / 2, Math.min(pIn.y, hy) - 40,
  { size: 30, color: C.gold });
fade(goldT, 6.8, 0.7);

/* counting texts */
const t1 = T('35 × 12  =  420 weights   +   12 biases', 960, 880, { size: 38, mono: true, color: C.text });
fade(t1, 11.0, 0.7); out(capNet, 10.9, 0.01);
to(w2g, 11.2, 0.6, { o: 0.18 });
const t2 = T('12 × 10  =  120 weights   +   10 biases', 960, 880, { size: 38, mono: true, color: C.text });
fade(t2, 19.2, 0.7); out(t1, 18.8, 0.4); out(goldL, 18.8, 0.4); out(goldT, 18.8, 0.4);
to(w2g, 18.9, 0.5, { o: 1 }); to(w1g, 19.0, 0.6, { o: 0.18 });
const t3 = T('420 + 12 + 120 + 10  =  562 numbers', 960, 880, { size: 44, mono: true, color: C.gold });
fade(t3, 24.0, 0.8); out(t2, 23.6, 0.4);
to(w1g, 23.7, 0.5, { o: 1 });

/* dot field: one dot per parameter */
out(netG, 28.7, 0.6); out(t3, 28.7, 0.4);
const DG = G();
const dots = [];
const pal = [C.blue, C.teal, C.green, C.yellow, C.orange, C.purple];
const dcols = 36, dsp = 26, dx0 = (1920 - (dcols - 1) * dsp) / 2, dy0 = 460 - 7.5 * 24;
for (let i = 0; i < 562; i++){
  const d = el('circle', { cx: dx0 + (i % dcols) * dsp, cy: dy0 + Math.floor(i / dcols) * 24, r: 4.5,
    fill: pal[i % 6] }, DG);
  dots.push(d);
}
DG.style.opacity = 0;
fade(DG, 29.4, 1.0);
sync((p, t) => {
  const k = Math.floor(t * 2.5);
  for (let i = 0; i < 562; i++) dots[i].setAttribute('fill', pal[(i + k) % 6]);
}, 29.4, 41.0);
const dLbl = T('not a program anyone wrote — just 562 numbers', 960, 700, { size: 36, color: C.dim });
fade(dLbl, 31.0, 0.8);
const bLbl = T('modern language models have billions of these — the recipe stays the same', 960, 800, { size: 32, color: C.dim });
fade(bLbl, 35.5, 0.8);

const q = T('So how do we find good values for them?', 960, 450, { size: 58, weight: '700', color: C.gold });
to(DG, 40.4, 0.8, { o: 0.15 }); to(dLbl, 40.4, 0.6, { o: 0.15 }); to(bLbl, 40.4, 0.6, { o: 0.15 });
wipe(q, 40.8, 1.3);

captions(DATA.narr);
progressBar(C.gold);
})();
