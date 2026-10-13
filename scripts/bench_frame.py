#!/usr/bin/env python3
"""Benchmark: per-frame cost of render(t)+JPEG screenshot at 1280x720."""
import time
from playwright.sync_api import sync_playwright

URL = 'file:///home/z/my-project/download/hyperframes_nn_video/s01_hook/index.html#freeze'
N = 12

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--hide-scrollbars', '--force-color-profile=srgb'])
    pg = b.new_page(viewport={'width': 1280, 'height': 720})
    pg.goto(URL)
    pg.wait_for_timeout(800)
    t0 = time.time()
    for i in range(N):
        pg.evaluate(f'window.__scene.render({6.0 + i * 0.5})')
        pg.screenshot(path=f'/tmp/bench_{i:03d}.jpg', type='jpeg', quality=85)
    dt = (time.time() - t0) / N
    print(f'per-frame: {dt*1000:.0f} ms  -> 19800 frames x {dt:.3f}s = {19800*dt/60:.1f} min single-worker')
    b.close()
