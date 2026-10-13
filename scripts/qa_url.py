#!/usr/bin/env python3
"""QA: the player must take its API base from the CLIENT origin, never hardcode localhost.

Checks
1. glm_server.mjs serves the project on TWO different ports (PORT env is honoured);
2. loading PLAYER.html from each origin gives SERVER_URL === location.origin, ONSERVER true;
3. same-origin API works from inside the page (fetch /api/health -> 200);
4. the served page contains the localhost:8787 literal exactly once (file:// fallback only);
5. opening PLAYER.html via file:// gives ONSERVER false and the localhost fallback.
"""
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PLAYER = ROOT / 'PLAYER.html'
PORTS = (8891, 8892)
FALLBACK = 'http://localhost:8787'


def wait_health(base: str, timeout: float = 30.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(base + '/api/health', timeout=2) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.4)
    return False


def main() -> int:
    html = PLAYER.read_text()
    n_lit = html.count("localhost:8787")
    print(f"[1] literal 'localhost:8787' occurrences in PLAYER.html: {n_lit}")
    if n_lit != 1:
        print("    FAIL — expected exactly 1 (the file:// fallback in SERVER_URL)")
        return 1

    servers = []
    try:
        for p in PORTS:
            env = dict(os.environ, PORT=str(p))
            proc = subprocess.Popen(
                ['bun', 'glm_server.mjs'], cwd=ROOT, env=env,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            servers.append(proc)
        bases = [f'http://127.0.0.1:{p}' for p in PORTS]
        for b in bases:
            if not wait_health(b):
                print(f"    FAIL — server not healthy on {b}")
                return 1
        print(f"[2] servers healthy on {bases}")

        failures = []
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            page = browser.new_page()
            for base in bases:
                page.goto(base + '/', wait_until='domcontentloaded')
                su = page.evaluate('SERVER_URL')
                on = page.evaluate('ONSERVER')
                h = page.evaluate("fetch('/api/health').then(r => r.status)")
                ok = (su == base) and (on is True) and (h == 200)
                print(f"[3] {base}  ->  SERVER_URL={su}  ONSERVER={on}  /api/health={h}  "
                      f"{'OK' if ok else 'FAIL'}")
                if not ok:
                    failures.append(base)
            # file:// open — no server: must fall back
            page.goto('file://' + str(PLAYER), wait_until='domcontentloaded')
            su = page.evaluate('SERVER_URL')
            on = page.evaluate('ONSERVER')
            ok = (su == FALLBACK) and (on is False)
            print(f"[4] file://PLAYER.html  ->  SERVER_URL={su}  ONSERVER={on}  "
                  f"{'OK' if ok else 'FAIL'}")
            if not ok:
                failures.append('file://')
            browser.close()

        if failures:
            print(f"RESULT: FAIL {failures}")
            return 1
        print("RESULT: ALL PASS — API base follows the client origin on every host")
        return 0
    finally:
        for s in servers:
            s.terminate()
            try:
                s.wait(timeout=5)
            except Exception:
                s.kill()


if __name__ == '__main__':
    sys.exit(main())
