#!/usr/bin/env python3
"""smoke_scene.py — validate generated Hyperframes scenes headlessly.

For each scene folder: load index.html#freeze in Chromium, capture console
errors / page errors, drive render() to 0 / mid / near-end, screenshot the
middle frame, and verdict ok | warn | fail.

Usage:
  python3 smoke_scene.py --root <dir> --out <result.json> folder [folder...]

Output JSON: { "results": [ {folder, verdict, errors, shot, dur} ... ] }
Exit code 0 always (verdicts are in the JSON).
"""
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

args = sys.argv[1:]
root, outf, folders = None, None, []
_skip = False
for a in args:
    if _skip:
        _skip = False
        continue
    if a == '--root':
        _skip = True; continue
    if a == '--out':
        _skip = True; continue
    folders.append(a)
# root/out were consumed via _skip in order; re-extract by position
vals = [args[i + 1] for i, a in enumerate(args) if a in ('--root', '--out')]
root = Path(vals[0]); outf = Path(vals[1])

W, H = 1280, 720
results = []

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--hide-scrollbars', '--force-color-profile=srgb'])
    for folder in folders:
        rec = {'folder': folder, 'verdict': 'fail', 'errors': [], 'shot': None}
        try:
            html = (root / folder / 'index.html').read_text()
            import re
            m = re.search(r'data-composition-duration="([0-9.]+)"', html)
            rec['dur'] = float(m.group(1)) if m else None
            pg = b.new_page(viewport={'width': W, 'height': H})
            errs = []
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(f'file://{root / folder / "index.html"}#freeze')
            pg.wait_for_timeout(500)
            has_scene = pg.evaluate('typeof window.__scene === "object" && !!window.__scene')
            if not has_scene:
                rec['errors'] = ['window.__scene missing — boot failed'] + errs
                pg.close()
                results.append(rec)
                continue
            dur = rec['dur'] or pg.evaluate('window.__scene.duration') or 10
            pg.evaluate(f'window.__scene.render(0)')
            pg.wait_for_timeout(120)
            mid = dur / 2
            pg.evaluate(f'window.__scene.render({mid:.3f})')
            pg.wait_for_timeout(120)
            shot = root / '.smoke' / f'{folder}.jpg'
            shot.parent.mkdir(parents=True, exist_ok=True)
            pg.screenshot(path=str(shot), type='jpeg', quality=80)
            pg.evaluate(f'window.__scene.render({max(0, dur - 0.2):.3f})')
            pg.wait_for_timeout(100)
            size = shot.stat().st_size if shot.exists() else 0
            rec['shot'] = str(shot)
            rec['errors'] = errs[:8]
            if errs:
                rec['verdict'] = 'warn'
            elif size < 4000:
                rec['verdict'] = 'fail'
                rec['errors'] = [f'near-blank frame ({size}B)']
            else:
                rec['verdict'] = 'ok'
            pg.close()
        except Exception as e:
            rec['verdict'] = 'fail'
            rec['errors'] = [str(e)[:300]]
        results.append(rec)
    b.close()

outf.write_text(json.dumps({'results': results}, indent=1))
print(json.dumps({'results': results}, indent=1))
