/* s01 — Prologue · The problem (40s) */
(function(){
begin({ n:'Prologue', title:'The problem', color:C.yellow });

const title = T('How does a machine learn to read?', 960, 150, { size: 66, weight: '700' });
wipe(title, 0.8, 1.6);

/* --- eight different sevens ------------------------------------------- */
const CW = 24, GAP = 1, GW = 5 * (CW + GAP) - GAP, GH = 7 * (CW + GAP) - GAP;
const cols = [568, 788, 1008, 1228], rowsY = [225, 435];
const sevens = [], sevAll = [];
for (let i = 0; i < 8; i++){
  const gx = cols[i % 4], gy = rowsY[Math.floor(i / 4)];
  const gr = grid(gx, gy, CW, 5, 7, DATA.sevens[i], { gap: GAP });
  sevens.push(gr); sevAll.push(gr.g);
  pop(gr.g, 6.0 + i * 0.28, 0.55);
}
const allAre = T('All of these are a 7', 960, 705, { size: 44, color: C.gold });
fade(allAre, 8.5, 0.8);
out(allAre, 12.2, 0.4);

/* --- hand-written rule fails ------------------------------------------ */
const panel = rect(560, 660, 800, 118, { rx: 14, fill: C.panel, stroke: C.line, w: 1.5 });
const rule1 = T('if top_row_bright and diagonal_down_left:', 600, 708, { size: 28, mono: true, anchor: 'start', color: C.text, show: true });
const rule2 = T('    label = "7"', 600, 748, { size: 28, mono: true, anchor: 'start', color: C.green, show: true });
const ruleG = G();                       // group to animate together
[panel, rule1, rule2].forEach(e => ruleG.appendChild(e));
pop(ruleG, 12.4, 0.7);

/* red X marks over three failing sevens (indices 1, 4, 7) */
const xMarks = [];
[1, 4, 7].forEach((idx, k) => {
  const gr = sevens[idx];
  const cx = gr.x + GW / 2, cy = gr.y + GH / 2, r = 58;
  const g = G();
  const l1 = line(cx - r, cy - r, cx + r, cy + r, { stroke: C.red, w: 7 }, g);
  const l2 = line(cx + r, cy - r, cx - r, cy + r, { stroke: C.red, w: 7 }, g);
  draw(l1, 15.6 + k * 0.35, 0.35); draw(l2, 15.75 + k * 0.35, 0.35);
  xMarks.push(g);
});
const breaks = T('The next example always breaks the rule', 960, 830, { size: 34, color: C.red });
fade(breaks, 18.0, 0.7);

/* --- flip the question: knobs ------------------------------------------ */
[allAre, ruleG, breaks].forEach(e => out(e, 20.3, 0.5));
sevAll.forEach(g => out(g, 20.3, 0.5));
xMarks.forEach(g => out(g, 20.3, 0.5));

const knobG = G();
const knobs = [];
for (let i = 0; i < 12; i++){
  const kx = 460 + (i % 6) * 200, ky = i < 6 ? 330 : 545;
  const kg = G(knobG);
  circle(kx, ky, 40, { stroke: C.grey, w: 4, fill: C.panel }, kg);
  const ptr = line(kx, ky, kx + 30, ky, { stroke: C.text, w: 5 }, kg);
  knobs.push({ kg, ptr, kx, ky, base: (i * 137.5) % 360 });
  pop(kg, 20.9 + i * 0.09, 0.5);
}
const knobLbl = T('the machine finds its own rules — by turning knobs', 960, 700, { size: 36, color: C.dim });
fade(knobLbl, 22.8, 0.8);
sync((p, t) => {
  knobs.forEach((k, i) => {
    const a = (k.base + 28 * Math.sin(t * 1.4 + i * 2.1)) * Math.PI / 180;
    k.ptr.setAttribute('x2', k.kx + 30 * Math.cos(a));
    k.ptr.setAttribute('y2', k.ky + 30 * Math.sin(a));
  });
}, 20.9, DUR);

/* --- 562 knobs ---------------------------------------------------------- */
[knobG, knobLbl].forEach(e => out(e, 27.7, 0.5));
const big = T('562 knobs', 960, 480, { size: 120, weight: '700', color: C.gold });
wipe(big, 28.4, 1.4);
const bigSub = T('every weight and bias in the network we are about to build', 960, 590, { size: 34, color: C.dim });
fade(bigSub, 30.2, 0.8);

/* --- roadmap ------------------------------------------------------------ */
[big, bigSub].forEach(e => out(e, 31.7, 0.5));
const items = ['Pixels', 'Neurons', 'Layers', 'Error', 'Descent', 'Backpropagation'];
const pal = [C.blue, C.teal, C.purple, C.red, C.orange, C.gold];
const roadG = G();
items.forEach((it, i) => {
  const px = 460 + (i % 3) * 500, py = i < 3 ? 360 : 480;
  const g = G(roadG);
  rect(px - 190, py - 40, 380, 80, { rx: 16, fill: C.panel, stroke: pal[i], w: 2 }, g);
  T(String(i + 1), px - 150, py + 12, { size: 34, color: pal[i], mono: true, show: true }, g);
  T(it, px + 24, py + 13, { size: 36, show: true }, g);
  pop(g, 32.2 + i * 0.55, 0.5);
});
out(roadG, 36.6, 0.5);

const letsGo = T("Let's build one.", 960, 450, { size: 84, weight: '700' });
wipe(letsGo, 37.1, 1.2);

captions(DATA.narr);
progressBar(C.yellow);
})();
