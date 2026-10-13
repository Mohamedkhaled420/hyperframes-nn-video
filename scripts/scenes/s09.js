/* s09 — Chapter 8 · Who is to blame? (65s) */
(function(){
begin({ n:'Chapter 8', title:'Who is to blame?', color:C.red });

const q = T('descent needs a slope for every knob — how do we find all 562?', 960, 135, { size: 34, color: C.dim });
fade(q, 1.0, 0.8);

/* chain diagram */
const dg = G();
const nx = circle(380, 480, 42, { fill: C.panel2, stroke: C.dim, w: 2.5 }, dg);
const nh = circle(940, 480, 42, { fill: C.panel2, stroke: C.dim, w: 2.5 }, dg);
const ny = circle(1500, 480, 42, { fill: C.panel2, stroke: C.dim, w: 2.5 }, dg);
const xl = T('x', 380, 492, { size: 40, mono: true, show: true }, dg);
const hl = T('h', 940, 492, { size: 40, mono: true, show: true }, dg);
const yl = T('y', 1500, 492, { size: 40, mono: true, show: true }, dg);
pop(nx, 5.6, 0.5); pop(nh, 5.8, 0.5); pop(ny, 6.0, 0.5);
pop(xl, 5.7, 0.5); pop(hl, 5.9, 0.5); pop(yl, 6.1, 0.5);
const a1 = arrow(426, 480, 894, 480, { stroke: C.blue, w: 6 }, dg);
const a2 = arrow(986, 480, 1454, 480, { stroke: C.red, w: 6 }, dg);
draw(a1, 6.4, 0.6); draw(a2, 6.8, 0.6);
const w1l = T('w₁ = 0.8', 660, 425, { size: 30, mono: true, color: C.blue, show: true }, dg);
const w2l = T('w₂ = −0.5', 1220, 425, { size: 30, mono: true, color: C.red, show: true }, dg);
fade(w1l, 6.9, 0.5); fade(w2l, 7.2, 0.5);
const lossBox = rect(1370, 660, 260, 110, { rx: 12, fill: C.panel, stroke: C.line, w: 1.5 }, dg);
const lossF = T('C = (y − 1)²', 1500, 705, { size: 30, mono: true, show: true }, dg);
const lossV = T('C = 1.96', 1500, 745, { size: 30, mono: true, color: C.red, show: true }, dg);
pop(lossBox, 7.6, 0.5); fade(lossF, 7.7, 0.5);
const la = arrow(1500, 640, 1500, 560, { stroke: C.grey, w: 3 }, dg);
draw(la, 8.0, 0.4);

/* forward values */
const v1 = T('x = 1', 380, 560, { size: 30, mono: true, color: C.text });
const v2 = T('h = 0.8', 940, 560, { size: 30, mono: true, color: C.text });
const v3 = T('y = −0.4', 1500, 560, { size: 30, mono: true, color: C.text });
fade(v1, 11.4, 0.5); fade(v2, 11.7, 0.5); fade(v3, 12.0, 0.5);
fade(lossV, 15.5, 0.6);
const fwd = T('one × 0.8 = 0.8,   × (−0.5) = −0.4   →   the target was 1', 960, 620, { size: 30, mono: true, color: C.dim });
fade(fwd, 11.4, 0.7);

/* backward blame */
const b1 = arrow(1470, 655, 1530, 555, { stroke: C.red, w: 4 }, dg);
draw(b1, 22.0, 0.5);
const g1 = T('dC/dy = −2.8', 1590, 620, { size: 27, mono: true, color: C.red, anchor: 'start' });
fade(g1, 22.4, 0.6);
const g2 = T('dC/dw₂ = −2.24   (−2.8 × 0.8)', 1080, 545, { size: 27, mono: true, color: C.gold });
fade(g2, 27.5, 0.6);
const b2 = arrow(1454, 375, 986, 375, { stroke: C.red, w: 3.5, dash: '9 7' }, dg);
draw(b2, 32.5, 0.7);
const g3 = T('dC/dh = 1.4', 1220, 350, { size: 27, mono: true, color: C.red });
fade(g3, 33.0, 0.6);
const g4 = T('dC/dw₁ = 1.4   (1.4 × 1)', 660, 545, { size: 27, mono: true, color: C.gold });
fade(g4, 36.0, 0.6);
const b3 = arrow(894, 375, 426, 375, { stroke: C.red, w: 3.5, dash: '9 7' }, dg);
draw(b3, 36.5, 0.7);

const blame = T('blame flows backwards, multiplying local slopes — the chain rule', 960, 230, { size: 34, color: C.orange });
fade(blame, 40.0, 0.8);

/* updates */
const upd = rect(480, 780, 960, 120, { rx: 14, fill: C.panel, stroke: C.line, w: 1.5 });
const u1 = T('w₂ ← −0.5 − 0.1 × (−2.24)  =  −0.276', 960, 825, { size: 30, mono: true, color: C.text });
const u2 = T('w₁ ← 0.8 − 0.1 × 1.4  =  0.66', 960, 868, { size: 30, mono: true, color: C.text });
pop(upd, 45.6, 0.6); fade(u1, 46.0, 0.6); fade(u2, 46.5, 0.6);
const etaL = T('learning rate η = 0.1', 960, 760, { size: 24, color: C.dim });
fade(etaL, 46.8, 0.6);

/* new forward pass */
const nv3 = T('y = −0.18', 1500, 560, { size: 30, mono: true, color: C.teal });
const nloss = T('C = 1.40', 1500, 745, { size: 30, mono: true, color: C.green });
out(v3, 51.2, 0.2); fade(nv3, 51.4, 0.5);
out(lossV, 51.8, 0.2); fade(nloss, 52.0, 0.5);
const imp = T('one nudge: −0.4 → −0.18,   loss 1.96 → 1.40', 960, 720, { size: 30, color: C.green });
fade(imp, 52.6, 0.7);

/* closing */
to(dg, 56.0, 0.7, { o: 0.22 });
to(upd, 56.0, 0.5, { o: 0.15 }); to(u1, 56.0, 0.5, { o: 0.15 }); to(u2, 56.0, 0.5, { o: 0.15 });
to(etaL, 56.0, 0.5, { o: 0.15 }); to(imp, 56.0, 0.5, { o: 0.15 });
to(v1, 56.0, 0.5, { o: 0.15 }); to(v2, 56.0, 0.5, { o: 0.15 }); to(nv3, 56.0, 0.5, { o: 0.3 });
to(nloss, 56.0, 0.5, { o: 0.3 }); to(blame, 56.0, 0.5, { o: 0.15 });
const fin = T('backprop does exactly this — for all 562 weights.<br>One pass forward, one pass back, one small step.',
  960, 430, { size: 46, weight: '700' });
wipe(fin, 56.4, 1.4);

captions(DATA.narr);
progressBar(C.red);
})();
