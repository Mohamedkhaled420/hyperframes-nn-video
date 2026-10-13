#!/usr/bin/env python3
"""Render all 12 scenes to JPEG frame sequences (30 fps, 1280x720) using
parallel Playwright workers. Writes progress to render_status.json.
Frames land in scripts/build/frames/<scene>/00001.jpg ...
"""
import json, os, time
from multiprocessing import Pool
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path('/home/z/my-project/download/hyperframes_nn_video')
FRAMES = Path('/home/z/my-project/scripts/build/frames')
STATUS = Path('/home/z/my-project/scripts/build/render_status.json')
FPS = 30
W, H = 1280, 720

import re
SCENES = []
for f in sorted(p.name for p in ROOT.iterdir()
                if p.is_dir() and re.match(r'^s\d\d_', p.name)):
    html = (ROOT / f / 'index.html').read_text()
    import re
    dur = float(re.search(r'data-composition-duration="([0-9.]+)"', html).group(1))
    SCENES.append((f, dur))
# longest-first for better load balance
SCENES.sort(key=lambda s: -s[1])
print('scenes:', SCENES, flush=True)


def worker(arg):
    folder, dur = arg
    outdir = FRAMES / folder
    outdir.mkdir(parents=True, exist_ok=True)
    n = round(dur * FPS)
    t0 = time.time()
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=['--hide-scrollbars', '--force-color-profile=srgb'])
        pg = b.new_page(viewport={'width': W, 'height': H})
        pg.goto(f'file://{ROOT}/{folder}/index.html#freeze')
        pg.wait_for_timeout(600)
        for i in range(n):
            pg.evaluate(f'window.__scene.render({i / FPS:.6f})')
            pg.screenshot(path=str(outdir / f'{i + 1:05d}.jpg'),
                          type='jpeg', quality=85)
        b.close()
    mark(folder, {'frames': n, 'seconds': round(time.time() - t0, 1), 'done': True})
    return folder, n, round(time.time() - t0, 1)


def mark(folder, st):
    data = json.loads(STATUS.read_text()) if STATUS.exists() else {}
    data[folder] = st
    data['_done'] = sum(1 for k, v in data.items() if isinstance(v, dict) and v.get('done'))
    STATUS.write_text(json.dumps(data, indent=1))


if __name__ == '__main__':
    STATUS.write_text(json.dumps({'_done': 0}))
    with Pool(2) as pool:
        for folder, n, secs in pool.imap_unordered(worker, SCENES):
            print(f'{folder}: {n} frames in {secs}s', flush=True)
    print('ALL RENDERED', flush=True)
