/* motion.js — deterministic, seek-safe motion engine for Hyperframes packs.
   Contract: every frame is a pure function of t. No setTimeout / Date / Math.random.
   window.__seek(t) drives everything; window.__ready resolves when fonts are in. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const W = 1920, H = 1080;

  /* ---------- design tokens (max 4 colors on screen at once) ---------- */
  const C = {
    bg: '#0b0e14', panel: '#121724', panel2: '#161c2b', line: '#26304a',
    ink: '#eef2f9', dim: '#9aa3b5', faint: '#5b6478',
    sky: '#7dd3fc', amber: '#fbbf24', ok: '#4ade80', bad: '#f87171',
    blue: '#60a5fa', teal: '#2dd4bf', green: '#a3e635', yellow: '#fde047',
    orange: '#fb923c', red: '#f87171', purple: '#c084fc', pink: '#f472b6'
  };
  const SANS = "Inter,'Liberation Sans','Helvetica Neue',Arial,sans-serif";
  const MONO = "'JetBrains Mono','Sarasa Mono SC','DejaVu Sans Mono',monospace";

  /* ---------- measured eases (motionmaxxing frame data) ---------- */
  const EASE = {
    softLand: t => 1 - Math.pow(1 - t, 3),
    outExpo: t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
    outQuint: t => 1 - Math.pow(1 - t, 5),
    inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    glide: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    snap: t => { const s = 1.30, u = t - 1; return u * u * ((s + 1) * u + s) + 1; },
    whip: t => t < .72 ? Math.pow(t / .72, 4) : 1 - Math.pow((1 - t) / .28, 2),
    accelExit: t => t * t,
    linear: t => t
  };

  /* ---------- state ---------- */
  const S = { tweens: [], frames: [], duration: 0, svg: null, layer: null, els: [] };
  let idc = 0;

  const lerp = (a, b, p) => a + (b - a) * p;
  const clamp01 = p => p < 0 ? 0 : p > 1 ? 1 : p;

  /* deterministic rng */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- element plumbing ---------- */
  function tr(el) { if (!el._tr) el._tr = { x: 0, y: 0, s: 1, r: 0, cx: 0, cy: 0 }; return el._tr; }
  function applyTr(el) {
    const t = el._tr; if (!t) return;
    let s = `translate(${t.x.toFixed(2)} ${t.y.toFixed(2)})`;
    if (t.s !== 1) s += ` scale(${t.s.toFixed(4)})`;
    if (t.r) s += ` rotate(${t.r.toFixed(2)} ${t.cx} ${t.cy})`;
    el.setAttribute('transform', s);
  }
  function E(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    (parent || S.layer).appendChild(el); return el;
  }
  function G(parent) { return E('g', {}, parent); }

  /* ---------- text ---------- */
  function T(text, x, y, o = {}) {
    const el = E('text', {
      x, y, fill: o.color || C.ink, 'font-size': o.size || 40,
      'font-family': o.mono ? MONO : SANS,
      'font-weight': o.w || (o.mono ? 500 : 400),
      'text-anchor': o.anchor || 'middle',
      'letter-spacing': o.ls != null ? o.ls + 'em' : '-0.015em',
      'dominant-baseline': o.base || 'middle'
    }, o.parent);
    if (o.html) el.innerHTML = text; else el.textContent = text;
    return el;
  }
  function Tml(lines, x, y, lh, o = {}) {
    const g = G(o.parent);
    lines.forEach((ln, i) => T(ln, x, y + i * lh, { ...o, parent: g }));
    return g;
  }

  /* ---------- tween verbs ---------- */
  function tw(el, t0, d, ease, from, to) {
    const rec = { el, t0, d: Math.max(0.001, d), ease, from, to };
    S.tweens.push(rec);
    if (el && el.setAttribute) { (el._tws || (el._tws = [])).push(rec); track(el); } // per-element group for pure seek
  }
  function seekOne(tw_, t) {
    const p = clamp01((t - tw_.t0) / tw_.d), e = tw_.ease(p);
    const f = tw_.from, o = tw_.to, el = tw_.el;
    const trc = el._tr || tr(el);
    if (f.x != null && o.x != null) trc.x = lerp(f.x, o.x, e);
    if (f.y != null && o.y != null) trc.y = lerp(f.y, o.y, e);
    if (f.s != null && o.s != null) trc.s = lerp(f.s, o.s, e);
    if (f.r != null && o.r != null) trc.r = lerp(f.r, o.r, e);
    if (f.x != null || f.y != null || f.s != null || f.r != null) applyTr(el);
    if (f.o != null) el.setAttribute('opacity', Math.max(0, lerp(f.o, o.o, e)).toFixed(3));
    if (f.val != null && el._applyVal) el._applyVal(lerp(f.val, o.val, e));
    if (f.dash != null) el.setAttribute('stroke-dashoffset', lerp(f.dash, o.dash, e).toFixed(2));
  }

  /* fade-in with small drift (arrive by moving) */
  function fade(el, t, d = 0.25, o = {}) {
    const f = { o: 0 }, to = { o: 1 };
    if (o.y) { f.y = o.y; to.y = 0; }
    if (o.x) { f.x = o.x; to.x = 0; }
    el.setAttribute('opacity', 0);
    if (f.y) { tr(el).y = f.y; applyTr(el); }
    if (f.x) { tr(el).x = f.x; applyTr(el); }
    tw(el, t, d, o.ease || EASE.outExpo, f, to);
    return el;
  }
  /* pop-in: scale 0.9→1 + fade, soft landing (cards, chips) */
  function pop(el, t, d = 0.4, o = {}) {
    tr(el).cx = o.cx != null ? o.cx : 0; tr(el).cy = o.cy != null ? o.cy : 0;
    el.setAttribute('opacity', 0);
    tr(el).s = o.from != null ? o.from : 0.9; applyTr(el);
    tw(el, t, d, o.ease || EASE.softLand, { o: 0, s: o.from != null ? o.from : 0.9 }, { o: 1, s: 1 });
    return el;
  }
  /* arrive from oversize — hero numbers (scale 1.6→1, outQuint) */
  function land(el, t, d = 0.55, o = {}) {
    const bb = el.getBBox ? el.getBBox() : { x: 0, y: 0, width: 0, height: 0 };
    tr(el).cx = bb.x + bb.width / 2; tr(el).cy = bb.y + bb.height / 2;
    el.setAttribute('opacity', 0);
    tw(el, t, d, o.ease || EASE.outQuint, { o: 0, s: o.from || 1.6 }, { o: 1, s: 1 });
    return el;
  }
  /* wipe reveal for headlines (clip left→right) */
  function wipe(el, t, d = 0.5) {
    const bb = el.getBBox();
    const id = 'cp' + (idc++);
    const cp = E('clipPath', { id }, el.parentNode);
    const rc = E('rect', { x: bb.x - 6, y: bb.y - 6, width: 0, height: bb.height + 12 }, cp);
    el.setAttribute('clip-path', `url(#${id})`);
    rc._applyVal = v => rc.setAttribute('width', Math.max(0, v));
    el.setAttribute('opacity', 1);
    tw(rc, t, d, EASE.outQuint, { val: 0 }, { val: bb.width + 12 });
    return el;
  }
  /* track elements that own tweens for the per-element seek pass */
  function track(el) { if (el && el.setAttribute && !el._tracked) { el._tracked = true; S.els.push(el); } }
  /* stroke draw-on (offset > dasharray so round caps never paint a start-dot) */
  function draw(p, t, d = 0.7, o = {}) {
    const L = p.getTotalLength ? p.getTotalLength() : 500;
    p.setAttribute('stroke-dasharray', L);
    p.setAttribute('stroke-dashoffset', L + 1);
    tw(p, t, d, o.ease || EASE.inOut, { dash: L + 1 }, { dash: 0 });
    return p;
  }
  /* generic transform move; only keys present in `to` are tweened */
  function move(el, t, d, to, ease) {
    const c = tr(el), f = {};
    if (to.x != null) f.x = c.x;
    if (to.y != null) f.y = c.y;
    if (to.s != null) f.s = c.s;
    if (to.r != null) f.r = c.r;
    tw(el, t, d, ease || EASE.inOut, f, to);
  }
  /* exit: accelerate out + fade (leaving = ease-in) */
  function exit(el, t, d = 0.3, o = {}) {
    const c = tr(el);
    const f = { o: 1, x: c.x, y: c.y, s: c.s };
    const to = { o: 0, x: o.x != null ? o.x : c.x, y: o.y != null ? o.y : c.y, s: o.s != null ? o.s : c.s };
    tw(el, t, d, o.ease || EASE.accelExit, f, to);
  }
  /* out = batch exit at scene end */
  function out(elems, t, d = 0.45, o = {}) {
    (Array.isArray(elems) ? elems : [elems]).forEach((el, i) => exit(el, t + (o.stag || 0) * i, d, o));
  }
  function to(elems, t, d, props) {
    (Array.isArray(elems) ? elems : [elems]).forEach(el => move(el, t, d, props, props && props.ease));
  }
  function stag(items, t, gap, fn) { items.forEach((it, i) => fn(it, t + i * gap, i)); }
  /* per-frame callback (curves, counters). fn(p, tAbs); optional reset() restores pre-window state on backward seek */
  function frame(t, d, fn, reset) { S.frames.push({ t0: t, d, fn, reset }); }

  /* value tween for plain objects {k:current} + obj._apply() */
  function vals(obj, t, d, toObj, ease) {
    const fromObj = {}; for (const k in toObj) fromObj[k] = obj[k];
    S.tweens.push({ custom: true, t0: t, d: Math.max(0.001, d), ease: ease || EASE.inOut, rec: { obj, fromObj, toObj } });
  }

  /* ---------- primitives ---------- */
  function opt(o) { return typeof o === 'string' ? { color: o, fill: o } : (o || {}); }
  function line(x1, y1, x2, y2, o = {}) { o = opt(o); return E('line', { x1, y1, x2, y2, stroke: o.color || C.line, 'stroke-width': o.w || 2, 'stroke-linecap': 'round', 'stroke-dasharray': o.dash || null }, o.parent); }
  function rect(x, y, w, h, o = {}) { o = opt(o); return E('rect', { x, y, width: w, height: h, rx: o.rx != null ? o.rx : 8, fill: o.fill || 'none', stroke: o.stroke || null, 'stroke-width': o.w || 2, opacity: o.opacity != null ? o.opacity : 1 }, o.parent); }
  function circ(cx, cy, r, o = {}) { o = opt(o); return E('circle', { cx, cy, r, fill: o.fill || 'none', stroke: o.stroke || null, 'stroke-width': o.w || 2 }, o.parent); }
  function pth(d, o = {}) { o = opt(o); return E('path', { d, fill: o.fill || 'none', stroke: o.color || C.sky, 'stroke-width': o.w || 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': o.dash || null }, o.parent); }
  function ellipse(cx, cy, rx, ry, o = {}) { o = opt(o); return E('ellipse', { cx, cy, rx, ry, fill: o.fill || 'none', stroke: o.stroke || null, 'stroke-width': o.w || 2 }, o.parent); }
  function arrow(x1, y1, x2, y2, o = {}) {
    const g = G(o.parent);
    const hl = o.head != null ? o.head : 13;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const bx = x2 - hl * Math.cos(ang), by = y2 - hl * Math.sin(ang);
    const ln = line(x1, y1, bx, by, { ...o, parent: g });
    const hw = hl * 0.62;
    const p2 = [x2 - hl * Math.cos(ang) - hw * Math.sin(ang), y2 - hl * Math.sin(ang) + hw * Math.cos(ang)];
    const p3 = [x2 - hl * Math.cos(ang) + hw * Math.sin(ang), y2 - hl * Math.sin(ang) - hw * Math.cos(ang)];
    E('polygon', { points: `${x2},${y2} ${p2},${p3}`, fill: o.color || C.dim }, g);
    return { g, ln };
  }
  function curve(x, y, w, h, fn, x0, x1, o = {}) {
    const N = o.n || 90; let d = '';
    const yLo = o.y0 != null ? o.y0 : 0, yHi = o.y1 != null ? o.y1 : 1;
    for (let i = 0; i <= N; i++) {
      const xv = x0 + (x1 - x0) * i / N, yv = fn(xv);
      const px = x + w * (xv - x0) / (x1 - x0), py = y + h - h * ((yv - yLo) / (yHi - yLo));
      d += (i ? 'L' : 'M') + px.toFixed(1) + ' ' + Math.max(y - h - 400, Math.min(y + h + 400, py)).toFixed(1);
    }
    return pth(d, o);
  }
  function axes(x, y, w, h, o = {}) {
    const g = G(o.parent);
    line(x, y + h, x + w, y + h, { color: C.faint, w: 2.5, parent: g });
    line(x, y + h, x, y, { color: C.faint, w: 2.5, parent: g });
    if (o.xlabel) T(o.xlabel, x + w / 2, y + h + (o.xpad || 46), { size: o.tsize || 26, color: C.dim, parent: g });
    if (o.ylabel) T(o.ylabel, x - (o.ypad || 42), y + h / 2, { size: o.tsize || 26, color: C.dim, parent: g, anchor: 'middle' }).setAttribute('transform', `rotate(-90 ${x - (o.ypad || 42)} ${y + h / 2})`);
    return g;
  }
  function vbars(x, y, bw, gap, hmax, vals0, o = {}) {
    const g = G(o.parent); const bars = [], labs = [];
    vals0.forEach((v, i) => {
      const bx = x + i * (bw + gap);
      const r = rect(bx, y + hmax - 2, bw, 2, { fill: o.color || C.sky, rx: 3, parent: g });
      bars.push(r);
      if (o.labels !== false) labs.push(T('', bx + bw / 2, y + hmax + 34, { size: o.lsize || 22, color: C.dim, parent: g }));
      if (o.digits !== false) T(String(i), bx + bw / 2, y + hmax + (o.labels === false ? 10 : 70), { size: 22, color: C.faint, parent: g });
    });
    const st = { vals: vals0.slice() };
    function ap() {
      bars.forEach((r, i) => {
        const h = Math.max(2, Math.max(0, Math.min(1, st.vals[i])) * hmax);
        r.setAttribute('y', y + hmax - h); r.setAttribute('height', h);
        r.setAttribute('fill', o.colorFn ? o.colorFn(i, st.vals[i]) : (o.color || C.sky));
        if (labs[i]) labs[i].textContent = o.fmt ? o.fmt(st.vals[i]) : Math.round(st.vals[i] * 100) + '%';
      });
    }
    ap();
    return { g, bars, labs, st,
      set(nv, t, d = 0.5, ease) {
        const from = st.vals.slice();
        frame(t, d, p => { const e = (ease || EASE.inOut)(p); st.vals = nv.map((v, i) => lerp(from[i], v, e)); ap(); },
          () => { st.vals = from.slice(); ap(); });
      },
      colorize(fn) { o.colorFn = fn; ap(); }
    };
  }
  /* pixel grid — digit bitmaps / heatmaps */
  function grid(x, y, cell, cols, rows, vals0, o = {}) {
    const g = G(o.parent); const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const rc = rect(x + c * (cell + (o.gap || 2)), y + r * (cell + (o.gap || 2)), cell, cell, { rx: Math.max(2, cell * 0.14), parent: g });
      cells.push(rc);
    }
    const st = { vals: (vals0 || new Array(cols * rows).fill(0)).slice() };
    function colorFor(v) {
      if (o.heat) { const a = Math.min(1, Math.abs(v) / (o.max || 1)); return v >= 0 ? `rgba(96,165,250,${0.10 + 0.90 * a})` : `rgba(248,113,113,${0.10 + 0.90 * a})`; }
      const a = Math.min(1, Math.max(0, v)); return `rgba(125,211,252,${0.05 + 0.95 * a})`;
    }
    function ap() {
      cells.forEach((rc, i) => { const v = st.vals[i] || 0; rc.setAttribute('fill', colorFor(v)); if (o.stroke) rc.setAttribute('stroke', o.stroke); });
    }
    ap();
    return { g, cells, st,
      set(nv, t, d = 0.4) {
        const from = st.vals.slice();
        frame(t, d, p => { const e = EASE.inOut(p); st.vals = nv.map((v, i) => lerp(from[i] || 0, v, e)); ap(); },
          () => { st.vals = from.slice(); ap(); });
      },
      numbers(size) {
        return cells.map((rc, i) => {
          const cx = parseFloat(rc.getAttribute('x')) + cell / 2, cy = parseFloat(rc.getAttribute('y')) + cell / 2;
          const t = T('', cx, cy, { size: size || 15, color: C.ink, parent: g, mono: true });
          frame(0, S.duration, () => { t.textContent = (st.vals[i] || 0).toFixed(1); });
          return t;
        });
      }
    };
  }
  /* neuron column */
  function layer(x, y, n, gap, r, o = {}) {
    const g = G(o.parent); const ns = [];
    const total = (n - 1) * gap;
    for (let i = 0; i < n; i++) {
      ns.push(circ(x, y + total / 2 - i * gap, r, { fill: o.fill || C.panel2, stroke: o.stroke || C.line, w: 2.5, parent: g }));
    }
    return { g, ns };
  }

  /* ---------- scene chrome ---------- */
  function scene(o) {
    S.duration = o.duration; S.tweens = []; S.frames = []; S.els = [];
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    document.body.appendChild(svg); S.svg = svg;
    E('rect', { x: 0, y: 0, width: W, height: H, fill: o.bg || C.bg }, svg);
    const defs = E('defs', {}, svg);
    const rg = E('radialGradient', { id: 'glow', cx: '50%', cy: '0%', r: '85%' }, defs);
    E('stop', { offset: '0%', 'stop-color': '#182238', 'stop-opacity': 0.9 }, rg);
    E('stop', { offset: '55%', 'stop-color': '#10151f', 'stop-opacity': 0.35 }, rg);
    E('stop', { offset: '100%', 'stop-color': '#0b0e14', 'stop-opacity': 0 }, rg);
    E('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#glow)' }, svg);
    /* static seeded film grain — kills gradient banding */
    const flt = E('filter', { id: 'grain', x: 0, y: 0 }, defs);
    const tn = E('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.9', numOctaves: '2', seed: '7', stitchTiles: 'stitch' }, flt);
    E('feColorMatrix', { in: 'n', type: 'matrix', values: '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.04 0' }, flt);
    E('rect', { x: 0, y: 0, width: W, height: H, filter: 'url(#grain)', opacity: 0.6 }, svg);
    S.layer = G(svg);
    return MT;
  }
  /* kicker + big title, top-left */
  function heading(kicker, title, o = {}) {
    const x = o.x || 120, y = o.y || 112;
    const t0 = o.t != null ? o.t : 0.15;
    const k = T(kicker.toUpperCase(), x, y - 54, { size: 25, color: o.kcolor || C.sky, anchor: 'start', w: 600, ls: 0.14 });
    const t = T(title, x, y, { size: o.size || 54, color: C.ink, anchor: 'start', w: 650, ls: -0.02 });
    if (!o.still) { fade(k, t0, 0.3, { y: 10 }); wipe(t, t0 + 0.12, 0.5); }
    return [k, t];
  }

  /* ---------- seek & ready (pure: same t → same frame, seek order independent) ---------- */
  function seek(t) {
    for (const tw_ of S.tweens) {
      if (tw_.custom) {
        if (t < tw_.t0) continue;
        const p = clamp01((t - tw_.t0) / tw_.d), e = tw_.ease(p);
        const { obj, fromObj, toObj } = tw_.rec;
        for (const k in toObj) obj[k] = lerp(fromObj[k], toObj[k], e);
        if (obj._apply) obj._apply();
      }
    }
    for (const el of S.els) {
      const tws = el._tws;
      let active = null;
      for (const w of tws) if (t >= w.t0) active = w;
      seekOne(active || tws[0], t); // latest window, else hold first from-state
    }
    for (const fr of S.frames) {
      if (t < fr.t0) { if (fr.reset) fr.reset(); continue; }
      fr.fn(clamp01((t - fr.t0) / fr.d), t);
    }
  }
  let _readyRes = null;
  function ready() {
    window.__duration = S.duration;
    window.__seek = seek;
    window.__ready = new Promise(res => { _readyRes = res; });
    const fin = () => requestAnimationFrame(() => _readyRes());
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fin); else fin();
    seek(0);
  }

  const MT = {
    C, EASE, W, H, S,
    E, G, T, Tml, line, rect, circ, pth, ellipse, arrow, curve, axes, vbars, grid, layer,
    scene, heading, fade, pop, land, wipe, draw, move, exit, out, to, stag, frame, vals, rng,
    seek, ready, applyTr, tr
  };
  window.MT = MT;
})();
