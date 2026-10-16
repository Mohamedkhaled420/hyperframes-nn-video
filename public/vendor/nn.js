/* nn.js — tiny deterministic neural net (35→12→10) + 5×7 digit bitmaps.
   Same contract as motion.js: seeded rng, pure functions, no Date/random. */
(function () {
  'use strict';
  const rng = window.MT ? MT.rng : (seed => { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; });

  /* 5×7 bitmaps, 1 = lit */
  const DIG = {
    0: ['01110','10001','10011','10101','11001','10001','01110'],
    1: ['00100','01100','00100','00100','00100','00100','01110'],
    2: ['01110','10001','00001','00010','00100','01000','11111'],
    3: ['11110','00001','00001','01110','00001','00001','11110'],
    4: ['00010','00110','01010','10010','11111','00010','00010'],
    5: ['11111','10000','11110','00001','00001','10001','01110'],
    6: ['00110','01000','10000','11110','10001','10001','01110'],
    7: ['11111','00001','00010','00100','01000','01000','01000'],
    8: ['01110','10001','10001','01110','10001','10001','01110'],
    9: ['01110','10001','10001','01111','00001','00010','01100']
  };
  function flat(d) { return DIG[d].join('').split('').map(c => c === '1' ? 1 : 0); }

  function noisy(d, seed, amt) {
    const x = flat(d), r = rng(seed * 7919 + 13);
    return x.map(v => Math.min(1, Math.max(0, v ? 0.85 + r() * 0.15 - (amt || 0) * r() * 0.2 : (amt || 0.13) * r() * (r() > 0.45 ? 1 : 0))));
  }

  const H = 12, OUT = 10, IN = 35;
  function makeNet(seed) {
    const r = rng(seed || 42);
    const W1 = [], B1 = [], W2 = [], B2 = [];
    const s1 = Math.sqrt(1 / IN), s2 = Math.sqrt(1 / H);
    for (let i = 0; i < H; i++) { const row = []; for (let j = 0; j < IN; j++) row.push((r() * 2 - 1) * s1 * 2.2); W1.push(row); B1.push(0); }
    for (let i = 0; i < OUT; i++) { const row = []; for (let j = 0; j < H; j++) row.push((r() * 2 - 1) * s2 * 2.2); W2.push(row); B2.push(0); }
    return { W1, B1, W2, B2 };
  }
  function sig(z) { return 1 / (1 + Math.exp(-z)); }
  function forward(net, x) {
    const h = net.W1.map((row, i) => sig(row.reduce((s, w, j) => s + w * x[j], net.B1[i])));
    const z2 = net.W2.map((row, i) => row.reduce((s, w, j) => s + w * h[j], net.B2[i]));
    const m = Math.max(...z2), ex = z2.map(z => Math.exp(z - m)), s = ex.reduce((a, b) => a + b, 0);
    return { h, p: ex.map(e => e / s) };
  }
  /* full training with per-epoch history (deterministic) */
  function trainNet(o = {}) {
    const epochs = o.epochs || 300, lr = o.lr || 2.0, seed = o.seed || 2024;
    const net = makeNet(seed);
    /* dataset: all 10 digits × 36 noisy variants; test: 10 harder unseen-seed variants each */
    const r = rng(seed + 1);
    const data = [], tdata = [];
    for (let d = 0; d < 10; d++) for (let k = 0; k < 36; k++) data.push({ x: noisy(d, k * 17 + d * 3 + 1, 0.15), y: d });
    for (let d = 0; d < 10; d++) for (let k = 100; k < 110; k++) tdata.push({ x: noisy(d, k * 31 + d * 5 + 7, 0.35), y: d });
    const hist = {}; const snaps = {};
    for (let ep = 1; ep <= epochs; ep++) {
      /* shuffle deterministically */
      for (let i = data.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = data[i]; data[i] = data[j]; data[j] = t; }
      let loss = 0;
      for (const ex of data) {
        const { h, p } = forward(net, ex.x);
        loss += -Math.log(Math.max(1e-9, p[ex.y]));
        /* backprop (softmax + CE → dz = p - y) */
        const dz2 = p.map((pv, i) => pv - (i === ex.y ? 1 : 0));
        for (let i = 0; i < OUT; i++) { for (let j = 0; j < H; j++) net.W2[i][j] -= lr * dz2[i] * h[j]; net.B2[i] -= lr * dz2[i]; }
        const dh = new Array(H).fill(0);
        for (let i = 0; i < OUT; i++) for (let j = 0; j < H; j++) dh[j] += net.W2[i][j] * dz2[i];
        for (let j = 0; j < H; j++) { const dz1 = dh[j] * h[j] * (1 - h[j]); for (let i2 = 0; i2 < IN; i2++) net.W1[j][i2] -= lr * dz1 * ex.x[i2]; net.B1[j] -= lr * dz1; }
      }
      const acc = (set) => { let c = 0; for (const ex of set) { const { p } = forward(net, ex.x); if (p.indexOf(Math.max(...p)) === ex.y) c++; } return c / set.length; };
      let tl = 0; for (const ex of tdata) { const { p } = forward(net, ex.x); tl += -Math.log(Math.max(1e-9, p[ex.y])); }
      hist[ep] = { loss: loss / data.length, tloss: tl / tdata.length, acc: acc(data), tacc: acc(tdata) };
      if (snappable(ep, o.snapEvery || 14)) snaps[ep] = { net: clone(net), hist: hist[ep] };
    }
    return { net, hist, snaps, tdata };
  }
  function snappable(ep, every) { return ep === 1 || ep % every === 0; }
  function clone(net) { return { W1: net.W1.map(r => r.slice()), B1: net.B1.slice(), W2: net.W2.map(r => r.slice()), B2: net.B2.slice() }; }

  window.NN = { DIG, flat, noisy, makeNet, forward, trainNet, rng, H, OUT, IN };
})();
