#!/usr/bin/env python3
"""E2E test of the AI tutor drawer: player served by glm_server.mjs,
click Ask AI, send a question, wait for GLM's reply, screenshot."""
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8787/'
SHOT = '/home/z/my-project/scripts/build/qa_player/ai_tutor.png'

errors = []
with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page(viewport={'width': 1600, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_timeout(1200)

    # jump to chapter 2 (single neuron), open the drawer
    page.evaluate('window.__player.pause(); window.__player.seek(95)')
    page.click('#btnAsk')
    page.wait_for_timeout(400)
    ctx = page.text_content('#aiCtx')

    page.fill('#aiIn', 'Why does the neuron squash the sum with a sigmoid?')
    page.click('#aiSend')
    page.wait_for_selector('.msg.bot', timeout=60000)
    answer = page.text_content('.msg.bot')
    page.wait_for_timeout(500)
    page.screenshot(path=SHOT)
    b.close()

print('drawer context :', ctx)
print('GLM answer     :', (answer or '')[:220].replace('\n', ' '))
print('page errors    :', errors if errors else 'none')
