#!/usr/bin/env python3
"""qa_shots.py — render each scene at key timestamps and screenshot for QA."""
import json, os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(ROOT, "build", "qa")
os.makedirs(OUTDIR, exist_ok=True)
BASE = os.path.join(ROOT, "..", "download", "hyperframes_nn_video")

SCENES = {
    "s01_hook":   [0.5, 7.5, 14.0, 17.0, 25.0, 30.0, 34.5, 38.5],
    "s02_pixels": [2.0, 8.0, 12.0, 19.5, 23.0, 31.0, 37.0, 44.0],
    "s03_neuron": [2.0, 8.0, 16.0, 22.5, 27.0, 36.0, 44.0, 54.0],
    "s04_layers": [3.0, 8.0, 12.0, 25.5, 31.0, 37.0, 43.0, 49.0],
    "s05_knobs":  [2.5, 7.0, 13.0, 21.0, 26.0, 31.5, 37.5, 42.5],
    "s06_forward":[2.0, 8.0, 15.0, 27.0, 33.0, 39.0, 47.5, 57.5],
    "s07_cost":   [3.0, 9.0, 14.0, 18.0, 28.0, 35.5, 41.0, 47.0],
    "s08_descent":[3.0, 8.0, 14.5, 20.0, 30.0, 37.0, 47.0, 58.0, 64.0, 68.5],
    "s09_backprop":[2.0, 8.0, 13.0, 24.0, 30.0, 38.0, 47.5, 53.0, 58.5],
    "s10_training":[2.5, 10.0, 20.0, 30.0, 40.0, 47.0, 52.0, 58.0, 63.0],
    "s11_inside": [3.0, 8.0, 18.5, 30.5, 36.0, 41.0, 43.5, 51.0],
    "s12_outro":  [3.0, 9.0, 23.0, 29.0, 33.0, 37.0, 39.5],
}

errors = {}
with sync_playwright() as p:
    browser = p.chromium.launch(args=["--force-color-profile=srgb"])
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    for sid, times in SCENES.items():
        url = "file://" + os.path.join(BASE, sid, "index.html") + "#freeze"
        page.goto(url, wait_until="load")
        page.wait_for_timeout(250)
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        # evaluate console errors via exposed binding
        page.evaluate("() => { window.__errs = window.__errs || []; }")
        for t in times:
            try:
                page.evaluate(f"() => window.__scene.peek({t})")
            except Exception as e:
                errs.append(f"peek({t}) failed: {e}")
                break
            page.screenshot(path=os.path.join(OUTDIR, f"{sid}_{str(t).replace('.','_')}.png"))
        if errs:
            errors[sid] = errs
    browser.close()

print(json.dumps(errors, indent=1) if errors else "NO PAGE ERRORS")
print("shots in", OUTDIR)
