/* s08 — Chapter 7 · Rolling downhill (70s) */
(function(){
begin({ n:'Chapter 7', title:'Rolling downhill', color:C.orange });

const AX0 = 320, AX1 = 1640, AY0 = 230, AY1 = 810;
const axes = path('M' + AX0 + ',' + AY0 + ' L' + AX0 + ',' + AY1 + ' L' + AX1 + ',' + AY1, { stroke: C.grey, w: 3 });
draw(axes, 1.0, 0.9);
const P8 = x => 760 - 0.0013 * (x - 960) * (x - 960);
let d = '';
for (let x = 360; x <= 1560; x += 12)
  d += (d ? ' L' : 'M') + x + ',' + P8(x).toFixed(1);
const bowl = path(d, { stroke: C.blue, w: 5 });
draw(bowl, 2.2, 1.6);
const bowlL = T('the cost, as a landscape', 960, 175, { size: 32, color: C.dim });
fade(bowlL, 3.4, 0.7);

const ball = circle(430, P8(430) - 16, 15, { fill: C.gold });
pop(ball, 4.6, 0.5);
function placeBall(x, t0){
  sync(() => {
    ball.setAttribute('cx', x);
    ball.setAttribute('cy', P8(x) - 16);
    ball.style.opacity = 1;
  }, t0, t0 + 0.01);
}

/* tangent line */
function tangent(x, col, tw){
  const k = -0.0026 * (x - 960);                 /* screen slope dy/dx */
  const y = P8(x) - 16;
  return line(x - 95, y + 95 * k, x + 95, y - 95 * k, { stroke: col || C.red, w: tw || 4 });
}
const tang = tangent(430);
draw(tang, 6.0, 0.6);
const tangL = T('we can feel the slope where we stand', 430, 285, { size: 28, color: C.red });
fade(tangL, 6.8, 0.6);

/* hop helper: x1 = x - eta * dC/dx * S ;  dC/dx = 0.0026*(x-960) */
const trails1 = [];
function hops(x0, eta, t0, n, stepT, col, dotR){
  let x = x0;
  for (let i = 0; i < n; i++){
    const g = 0.0026 * (960 - x) * 180 * eta;
    const xa = x;
    let x1 = x + g;
    const off = Math.abs(x1 - 960) > 600;
    if (off) x1 = Math.max(370, Math.min(1550, x1));
    const tA = t0 + i * stepT;
    sync((p) => {
      const e = easeIO(p);
      ball.setAttribute('cx', lerp(xa, x1, e));
      ball.setAttribute('cy', P8(lerp(xa, x1, e)) - 16);
    }, tA, tA + stepT * 0.62);
    const td = circle(x1, P8(x1) - 16, dotR || 5, { fill: col });
    pop(td, tA + stepT * 0.62, 0.25);
    trails1.push(td);
    x = x1;
  }
}
/* run 1: eta = 1.0 — confident steps into the bottom */
hops(430, 1.0, 11.6, 5, 1.5, C.teal);
const r1l = T('η = 1.0', 400, 745, { size: 30, mono: true, color: C.teal });
fade(r1l, 11.8, 0.5);
const stepL = T('step = η × slope', 960, 630, { size: 36, mono: true, color: C.text });
fade(stepL, 17.5, 0.7);

/* run 2: eta = 0.05 — tiny cautious steps */
placeBall(430, 26.9);
trails1.forEach(td => out(td, 26.8, 0.3));
out(tang, 26.7, 0.3); out(tangL, 26.7, 0.3); out(r1l, 27.1, 0.3);
const trails2 = [];
(function(){
  let x = 430;
  for (let i = 0; i < 10; i++){
    const g = 0.0026 * (960 - x) * 180 * 0.05;
    const xa = x; x = x + g;
    const x1 = x, tA = 27.4 + i * 0.55;
    sync((p) => {
      const e = easeIO(p);
      ball.setAttribute('cx', lerp(xa, x1, e));
      ball.setAttribute('cy', P8(lerp(xa, x1, e)) - 16);
    }, tA, tA + 0.34);
    const td = circle(x1, P8(x1) - 16, 4, { fill: C.teal });
    pop(td, tA + 0.34, 0.2); trails2.push(td);
  }
})();
const r2l = T('η = 0.05 — crawling', 430, 745, { size: 30, mono: true, color: C.dim });
fade(r2l, 27.6, 0.5);

/* run 3: eta = 5.2 — overshoot, wall to wall, climbs out */
placeBall(430, 33.9);
trails2.forEach(td => out(td, 33.85, 0.2));
out(stepL, 33.6, 0.3); out(r2l, 34.9, 0.3);
const seq3 = [430, 1550, 624, 1441, 368, 1580];
(function(){
  for (let i = 0; i < seq3.length - 1; i++){
    const xa = seq3[i], x1 = seq3[i + 1];
    const tA = 34.0 + i * 1.35;
    const fly = i === seq3.length - 2;
    sync((p) => {
      const e = easeIO(p);
      const xv = lerp(xa, x1, e);
      ball.setAttribute('cx', xv);
      ball.setAttribute('cy', P8(xv) - 16 - (fly ? p * p * 300 : 0));
      if (fly) ball.style.opacity = String(Math.max(0, 1 - p * 1.1));
    }, tA, tA + (fly ? 1.0 : 0.85));
    if (!fly){
      const td = circle(x1, P8(x1) - 16, 4, { fill: C.red });
      pop(td, tA + 0.85, 0.2);
      out(td, 43.2, 0.3);
    }
  }
})();
const r3l = T('η = 5.2 — overshooting', 960, 630, { size: 30, mono: true, color: C.red });
fade(r3l, 34.2, 0.5);
out(r3l, 42.8, 0.4);

/* --- two knobs: contour landscape --------------------------------------- */
[axes, bowl, bowlL, ...trails1].forEach(e => out(e, 43.4, 0.5));
const CG = G();
const cx = 1180, cy = 540, rot = -18;
for (let i = 1; i <= 6; i++){
  const e = el('ellipse', { cx, cy, rx: 60 * i, ry: 40 * i, fill: 'none', stroke: '#44586e',
    'stroke-width': 2, transform: 'rotate(' + rot + ' ' + cx + ' ' + cy + ')' }, CG);
  draw(e, 44.0 + i * 0.35, 0.6);
}
CG.style.opacity = 0;
fade(CG, 44.0, 0.5);
const ringsL = T('two knobs: rings join points of equal cost', 960, 175, { size: 32, color: C.dim });
fade(ringsL, 45.4, 0.7);
const ball2 = circle(520, 330, 15, { fill: C.gold });
pop(ball2, 47.6, 0.5);
const dirA = arrow(520, 330, 640, 428, { stroke: C.red, w: 4.5 });
draw(dirA, 50.5, 0.6);
const dirL = T('the steepest way down', 700, 345, { size: 28, color: C.red, anchor: 'start' });
fade(dirL, 51.2, 0.6);

/* zigzag path */
const zig = [[520, 330], [700, 428], [585, 520], [790, 585], [665, 665], [900, 660], [820, 738], [1040, 690], [1180, 540]];
const zp = path('M' + zig.map(p => p[0] + ',' + p[1]).join(' L'), { stroke: C.gold, w: 4 });
draw(zp, 54.6, 5.4);
zig.forEach((p, i) => {
  const td = circle(p[0], p[1], 5, { fill: C.gold });
  pop(td, 54.6 + (i + 1) * 0.6, 0.2);
  to(td, 61.6, 0.5, { o: 0.25 });
});
out(dirA, 54.4, 0.3); out(dirL, 54.4, 0.3);
const dimL = T('a real network: 562 knobs — a landscape in 562 dimensions. Same rule.', 960, 128, { size: 30, color: C.dim });
fade(dimL, 56.5, 0.7);

/* update rule */
to(CG, 61.6, 0.7, { o: 0.25 }); to(zp, 61.6, 0.5, { o: 0.25 }); to(ball2, 61.6, 0.5, { o: 0.25 });
to(ringsL, 61.6, 0.5, { o: 0.1 }); to(dimL, 61.6, 0.5, { o: 0.1 });
const rule = T('w  ←  w − η · ∂C/∂w', 960, 600, { size: 66, mono: true, weight: '700' });
wipe(rule, 62.0, 1.4);
const rep = T('repeat, thousands of times', 960, 715, { size: 34, color: C.dim });
fade(rep, 67.0, 0.8);

captions(DATA.narr);
progressBar(C.orange);
})();
