/* s11 — Chapter 10 · What did it learn? (55s) */
(function(){
begin({ n:'Chapter 10', title:'What did it learn?', color:C.purple });

const W1 = DATA.net.W1;
const wmax = Math.max.apply(null, W1.flat().map(Math.abs));

/* 12 weight heat-maps */
const mapsG = G();
const maps = [];
for (let j = 0; j < 12; j++){
  const col = j % 6, row = Math.floor(j / 6);
  const x = 225 + col * 255, y = 215 + row * 265;
  const h = heat(x, y, 24, 5, 7, W1[j], { gap: 1, max: wmax });
  mapsG.appendChild(h.g);
  const lb = T('neuron ' + (j + 1), x + 62, y + 200, { size: 22, color: C.faint, show: true }, mapsG);
  maps.push(h.g);
  pop(h.g, 1.0 + j * 0.4, 0.55);
  fade(lb, 1.3 + j * 0.4, 0.5);
}
const leg = G();
rect(660, 762, 22, 22, { rx: 4, fill: 'rgba(88,196,221,0.9)' }, leg);
T('pixel excites the neuron', 696, 780, { size: 26, color: C.dim, anchor: 'start', show: true }, leg);
rect(1090, 762, 22, 22, { rx: 4, fill: 'rgba(252,98,85,0.9)' }, leg);
T('pixel inhibits it', 1126, 780, { size: 26, color: C.dim, anchor: 'start', show: true }, leg);
fade(leg, 6.5, 0.7);

const mess = T('not tidy loops and strokes — blurry, overlapping templates', 960, 130, { size: 34, color: C.orange });
fade(mess, 17.0, 0.8);

/* --- test 1: random static ---------------------------------------------- */
to(mapsG, 27.5, 0.7, { o: 0.12 }); to(leg, 27.5, 0.5, { o: 0.1 }); to(mess, 27.5, 0.5, { o: 0.1 });
const st = DATA.static;
const sg = grid(430, 300, 24, 5, 7, st.grid, { gap: 1 });
fade(sg.g, 28.2, 0.8);
const sgl = T('random static', 487, 552, { size: 28, color: C.dim });
fade(sgl, 28.6, 0.6);
const BR = bars(940, 545, 560, 235, { gap: 11, vsize: 20, lsize: 22 });
BR.g.style.opacity = 0;
fade(BR.g, 29.0, 0.6);
sync((p) => { BR.set(lerpA(new Array(10).fill(0), st.p, easeIO(p))); }, 29.0, 31.0);
BR.highlight(st.d, C.gold);
const res1 = T('static  →  ' + st.d + ',  ' + st.pct + '% sure', 1220, 640, { size: 42, mono: true, color: C.gold });
fade(res1, 33.8, 0.8);
const noKnow = T('it was never taught to say "I do not know"', 1220, 700, { size: 28, color: C.dim });
fade(noKnow, 35.8, 0.7);

/* --- test 2: blended digit ---------------------------------------------- */
[sg.g, sgl, BR.g, res1, noKnow].forEach(e => out(e, 38.3, 0.4));
const bl = DATA.blend;
const CW = 19, CG = 1;
const g4 = grid(200, 330, CW, 5, 7, bl.g4, { gap: CG });
const g9 = grid(420, 330, CW, 5, 7, bl.g9, { gap: CG });
const gb = grid(640, 330, CW, 5, 7, bl.grid, { gap: CG });
fade(g4.g, 39.4, 0.5); fade(g9.g, 39.7, 0.5); fade(gb.g, 40.2, 0.5);
const plus = T('+', 355, 405, { size: 52, color: C.dim });
const eqs = T('=', 575, 405, { size: 52, color: C.dim });
fade(plus, 39.8, 0.4); fade(eqs, 40.3, 0.4);
const l4 = T('a four', 245, 545, { size: 26, color: C.dim });
const l9 = T('a nine', 465, 545, { size: 26, color: C.dim });
const lb = T('the blend', 687, 545, { size: 26, color: C.dim });
fade(l4, 39.9, 0.5); fade(l9, 40.2, 0.5); fade(lb, 40.7, 0.5);
const BR2 = bars(940, 545, 560, 235, { gap: 11, vsize: 20, lsize: 22 });
BR2.g.style.opacity = 0;
fade(BR2.g, 39.4, 0.6);
sync((p) => { BR2.set(lerpA(new Array(10).fill(0), bl.p, easeIO(p))); }, 40.4, 42.2);
BR2.highlight(bl.top[0][0], C.gold);
const res2 = T('its belief splits:  ' + bl.top[0][0] + ' at ' + bl.top[0][1] + '%,  ' +
  bl.top[1][0] + ' at ' + bl.top[1][1] + '%', 1220, 640, { size: 38, mono: true, color: C.gold });
fade(res2, 42.6, 0.8);

/* --- closing ------------------------------------------------------------- */
const closers = [mapsG, leg, mess, g4.g, g9.g, gb.g, plus, eqs, l4, l9, lb, BR2.g, res2];
closers.forEach(e => to(e, 44.6, 0.6, { o: 0.1 }));
const fin = T('A network only knows the world<br>it was trained on.', 960, 420, { size: 62, weight: '700' });
wipe(fin, 44.8, 1.6);
const fin2 = T('understanding that gap matters as much as the math', 960, 620, { size: 36, color: C.dim });
fade(fin2, 50.0, 0.8);

captions(DATA.narr);
progressBar(C.purple);
})();
