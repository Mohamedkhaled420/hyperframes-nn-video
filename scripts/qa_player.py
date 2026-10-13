#!/usr/bin/env python3
"""QA the bundled PLAYER.html: load it, seek to key times across all 12
scenes, screenshot, and collect any console/page errors."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

PLAYER = 'file:///home/z/my-project/download/hyperframes_nn_video/PLAYER.html'
OUT = Path('/home/z/my-project/scripts/build/qa_player')
OUT.mkdir(parents=True, exist_ok=True)

# one probe per scene: a few seconds into each chapter
probes = [(0, 3, 's01'), (42, 3, 's02'), (92, 3, 's03'), (152, 3, 's04'),
          (207, 3, 's05'), (252, 3, 's06'), (312, 3, 's07'), (362, 3, 's08'),
          (433, 3, 's09'), (498, 3, 's10'), (568, 3, 's11'), (655, 3, 's12')]

errors = []
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--force-color-profile=srgb'])
    page = b.new_page(viewport={'width': 1600, 'height': 900})
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(PLAYER)
    page.wait_for_timeout(1500)

    scene_of = lambda: page.evaluate('window.__player.scene')
    fails = []
    for gT, settle, name in probes:
        page.evaluate(f'window.__player.seek({gT}); window.__player.pause();')
        page.wait_for_timeout(settle * 100)
        idx = scene_of()
        if idx != name and f's{idx+1:02d}' != name:
            fails.append(f't={gT}: expected scene {name}, master reports s{idx+1:02d}')
        page.screenshot(path=str(OUT / f'p_{gT:03d}_{name}.png'))

    # live playback: play 2 s from t=100 and confirm time advances
    page.evaluate('window.__player.seek(100); window.__player.play();')
    page.wait_for_timeout(2000)
    t1 = page.evaluate('window.__player.time')
    if not (101.5 <= t1 <= 103.5):
        fails.append(f'playback: expected ~102s, got {t1}')

    b.close()

print('probe failures:', fails if fails else 'none')
print('console/page errors:', errors if errors else 'none')
print('shots:', len(list(OUT.glob("*.png"))))
sys.exit(1 if fails or errors else 0)
