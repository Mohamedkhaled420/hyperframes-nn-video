#!/usr/bin/env python3
"""diag_s04.py — inspect computed states of s04 node circles at t=12."""
import os
from playwright.sync_api import sync_playwright

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "download", "hyperframes_nn_video")
url = "file://" + os.path.join(BASE, "s04_layers", "index.html") + "#freeze"

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1920, "height": 1080})
    msgs = []
    page.on("console", lambda m: msgs.append(m.text))
    page.goto(url, wait_until="load")
    page.wait_for_timeout(300)
    page.evaluate("window.__scene.peek(12)")
    info = page.evaluate("""() => {
      const circles = [...document.querySelectorAll('#root circle')];
      const c = circles[1];  // first pixels-column node
      const st = window.__dbg.STATES.find(s => s.el === c);
      return {
        style_op: c.style.opacity, style_tf: c.style.transform,
        base: st ? st.st : null,
        ops: st ? st.ops.map(o => ({t: o.t0, d: o.dur, type: o.type})) : null,
        eb1: window.__dbg.easeBack(1), eb: st ? window.__dbg.easeBack(1) : null
      };
    }""")
    print(info)
    b.close()
