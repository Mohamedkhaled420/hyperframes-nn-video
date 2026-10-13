/* s02 — Chapter 1 · Pictures are numbers (50s) */
(function(){
begin({ n:'Chapter 1', title:'Pictures are numbers', color:C.blue });

const GX = 700, GY = 300, CELL = 34, GAP = 1;
const g3 = grid(GX, GY, CELL, 5, 7, DATA.dig3, { gap: GAP });
fade(g3.g, 1.2, 1.0);
const cap = T('a digit on a grid — 5 pixels wide, 7 tall', 960, 620, { size: 36, color: C.dim });
fade(cap, 2.2, 0.8);

/* highlight one pixel */
const pr = 1, pc = 2;
const bx = GX + pc * (CELL + GAP) - 4, by = GY + pr * (CELL + GAP) - 4;
const box = rect(bx, by, CELL + 8, CELL + 8, { rx: 6, stroke: C.yellow, w: 3.5 });
draw(box, 5.5, 0.7);
const one = T('each square holds one number: its brightness, 0 → 1', 960, 690, { size: 34, color: C.yellow });
fade(one, 6.0, 0.8);

/* cell numbers */
const nums = [];
g3.cells.forEach((rc, i) => {
  const r = Math.floor(i / 5), c = i % 5;
  const v = DATA.dig3[i];
  const t = T(v.toFixed(1), GX + c * (CELL + GAP) + CELL / 2, GY + r * (CELL + GAP) + CELL / 2 + 6,
    { size: 15, color: v > 0.5 ? '#0e131a' : C.faint, show: true });
  nums.push(t);
});
nums.forEach((t, i) => fade(t, 10.0 + (i % 7) * 0.06 + Math.floor(i / 7) * 0.12, 0.3));

/* unroll into a column vector */
const VX = 1330, VCELL = 16, VGAP = 2, VY0 = 185;
const colCells = [];
const flyG = G();
g3.cells.forEach((rc, i) => {
  const r = Math.floor(i / 5), c = i % 5;
  const x0 = GX + c * (CELL + GAP), y0 = GY + r * (CELL + GAP);
  const x1 = VX, y1 = VY0 + i * (VCELL + VGAP);
  const rc2 = el('rect', { x: x0, y: y0, width: CELL, height: CELL, rx: 5,
    fill: rc.getAttribute('fill') }, flyG);
  colCells.push({ rc2, x0, y0, x1, y1, d: i * 0.028 });
});
out(g3.g, 17.0, 0.01);   // grid replaced by flying copies
nums.forEach((t, i) => out(t, 16.99, 0.01));
out(cap, 16.2, 0.4); out(one, 16.2, 0.4); out(box, 16.2, 0.4);
const unroll = T('unroll it, row after row — one long list', 960, 660, { size: 36, color: C.dim });
fade(unroll, 17.6, 0.8);
sync((p, t) => {
  colCells.forEach(cc => {
    const q = clamp((t - 17.0 - cc.d) / 0.75, 0, 1), e = easeIO(q);
    cc.rc2.setAttribute('x', lerp(cc.x0, cc.x1, e));
    cc.rc2.setAttribute('y', lerp(cc.y0, cc.y1, e));
    cc.rc2.setAttribute('width', lerp(CELL, VCELL, e));
    cc.rc2.setAttribute('height', lerp(CELL, VCELL, e));
  });
}, 17.0, 18.2);

/* brackets + label */
const bTop = VY0 - 12, bBot = VY0 + 35 * (VCELL + VGAP) - VGAP + 12;
const brL = path('M' + (VX - 16) + ',' + (bTop + 14) + ' L' + (VX - 26) + ',' + bTop +
                 ' L' + (VX - 26) + ',' + bBot + ' L' + (VX - 16) + ',' + bBot, { stroke: C.dim, w: 2.5 });
const brR = path('M' + (VX + VCELL + 6) + ',' + (bTop + 14) + ' L' + (VX + VCELL + 16) + ',' + bTop +
                 ' L' + (VX + VCELL + 16) + ',' + bBot + ' L' + (VX + VCELL + 6) + ',' + bBot, { stroke: C.dim, w: 2.5 });
fade(brL, 18.4, 0.6); fade(brR, 18.4, 0.6);
const xLab = T('x', VX + 90, VY0 + 300, { size: 46, mono: true, color: C.blue, anchor: 'start' });
const xSub = T('the input — a list of 35 numbers', VX + 90, VY0 + 350, { size: 30, color: C.dim, anchor: 'start' });
fade(xLab, 19.4, 0.7); fade(xSub, 20.0, 0.7);
fade(flyG, 17.0, 0.01);
to(unroll, 22.0, 0.8, { o: 0 });

/* --- bigger pictures ----------------------------------------------------- */
[flyG, brL, brR, xLab, xSub].forEach(e => out(e, 28.3, 0.5));
const g28 = grid(660, 260, 8, 28, 28, DATA.g28, { gap: 1 });
fade(g28.g, 29.0, 1.0);
const l28 = T('28 × 28 = 784 numbers', 660 + 116, 580, { size: 40, mono: true, color: C.text });
fade(l28, 29.8, 0.8);
const ph = T('a phone photo:  4000 × 3000 × 3  =  36,000,000 numbers', 960, 680, { size: 36, color: C.dim });
fade(ph, 35.2, 0.8);
out(g28.g, 41.5, 0.5); out(l28, 41.5, 0.5); out(ph, 41.5, 0.5);

const close = T('A picture is a list of numbers.', 960, 460, { size: 64, weight: '700' });
wipe(close, 42.2, 1.4);

captions(DATA.narr);
progressBar(C.blue);
})();
