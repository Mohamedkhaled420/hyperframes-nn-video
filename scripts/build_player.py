#!/usr/bin/env python3
"""Bundle the 12 Hyperframes scenes into ONE self-contained PLAYER.html.

Why: the deliverable was 12 separate index.html files in folders, which many
previewers cannot open. A single file with everything inlined can be
double-clicked anywhere and plays the full 11-minute video.

Mechanics:
- Each scene's index.html is read in jobs.csv order; its inner autoplay is
  disabled (string replace of the engine's autoplay condition), then the whole
  HTML is embedded as a string.
- The master player renders scenes into an <iframe srcdoc> and drives them
  with the documented seek contract: postMessage {type:'hf-seek', t} every
  frame. Deterministic render(t) makes this frame-exact.
- One global timeline (sum of scene durations), chapter chips, scrub bar with
  chapter ticks, keyboard shortcuts, fullscreen.
"""
import csv, json, re, sys
from pathlib import Path

ROOT = Path('/home/z/my-project/download/hyperframes_nn_video')
OUT = ROOT / 'PLAYER.html'

# ---------------------------------------------------------------- read jobs
order = []
with open(ROOT / 'jobs.csv', newline='') as f:
    for row in csv.DictReader(f):
        order.append(row['folder'].strip())
if len(order) != 12:
    sys.exit(f'jobs.csv: expected 12 rows, got {len(order)}')

scenes = []
for i, folder in enumerate(order):
    p = ROOT / folder / 'index.html'
    html = p.read_text()
    m = re.search(r'data-composition-duration="([0-9.]+)"', html)
    if not m:
        sys.exit(f'{p}: no data-composition-duration')
    dur = float(m.group(1))
    t = re.search(r'<title>([^<]+)</title>', html)
    title = t.group(1).replace('Hyperframes · ', '').strip() if t else folder

    # disable the scene's own realtime autoplay — the master clock drives it
    AUTO = "if (location.hash.indexOf('freeze') < 0){"
    if AUTO not in html:
        sys.exit(f'{p}: autoplay hook not found — engine changed?')
    html = html.replace(AUTO, 'if (false){ /* autoplay off: master player drives */')

    short = folder.split('_', 1)[1] if '_' in folder else folder
    scenes.append({'folder': folder, 'title': title, 'short': short,
                   'dur': dur, 'html': html})

# cumulative starts/ends
t0 = 0.0
for s in scenes:
    s['start'] = t0
    t0 += s['dur']
    s['end'] = t0
TOTAL = t0
print(f'{len(scenes)} scenes, total {TOTAL:.0f}s ({TOTAL/60:.1f} min)')

payload = json.dumps(scenes).replace('</', '<\\/')   # safe inside <script>

# ---------------------------------------------------------------- player UI
page = r'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>How does a machine learn to read? — Player</title>
<style>
  :root { --bg:#0b0f16; --panel:#141b26; --line:#2a3342; --text:#E8EDF4;
          --dim:#93A1B3; --accent:#58C4DD; --gold:#FFC53D; }
  * { box-sizing:border-box; }
  html, body { margin:0; height:100%; }
  body { background:var(--bg); color:var(--text);
         font:15px/1.45 'Liberation Sans','DejaVu Sans',Arial,sans-serif;
         overflow:hidden; }
  #app { height:100%; display:flex; flex-direction:column; }

  header { padding:10px 18px 6px; border-bottom:1px solid var(--line);
           background:var(--panel); flex:0 0 auto; }
  .title-row { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; }
  h1 { font-size:18px; margin:0; letter-spacing:.2px; }
  h1 b { color:var(--gold); font-weight:700; }
  .total { color:var(--dim); font-size:13px; }
  nav#chips { display:flex; gap:6px; padding:8px 0 4px; flex-wrap:wrap; }
  .chip { border:1px solid var(--line); background:#101722; color:var(--dim);
          border-radius:999px; padding:3px 11px; font-size:12.5px; cursor:pointer; }
  .chip:hover { color:var(--text); border-color:var(--accent); }
  .chip.on { color:#0b0f16; background:var(--accent); border-color:var(--accent);
             font-weight:700; }

  main { flex:1 1 auto; min-height:0; display:flex; align-items:center;
         justify-content:center; padding:14px 18px; }
  #stagebox { position:relative; aspect-ratio:16/9; width:100%;
              max-height:100%; max-width:calc((100vh - 235px) * 1.7778);
              background:#0f141c; border:1px solid var(--line);
              border-radius:10px; overflow:hidden; }
  #frame { display:block; width:100%; height:100%; border:0; background:#0f141c; }

  footer { flex:0 0 auto; padding:6px 18px 10px; border-top:1px solid var(--line);
           background:var(--panel); }
  #bar { position:relative; height:14px; margin:2px 0 8px; cursor:pointer; touch-action:none; }
  #bar .rail { position:absolute; left:0; right:0; top:5px; height:5px;
               border-radius:3px; background:#232d3d; }
  #bar .fill { position:absolute; left:0; top:5px; height:5px; width:0;
               border-radius:3px; background:linear-gradient(90deg,#58C4DD,#5FD3BC); }
  #bar .knob { position:absolute; top:1px; width:13px; height:13px; margin-left:-6px;
               border-radius:50%; background:#fff; box-shadow:0 0 0 3px rgba(88,196,221,.35); }
  #bar .tick { position:absolute; top:2px; width:2px; height:11px; background:#3a465a; }
  #bar:hover .knob { box-shadow:0 0 0 5px rgba(88,196,221,.45); }

  #controls { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  button { font:inherit; color:var(--text); background:#1b2432;
           border:1px solid var(--line); border-radius:8px; padding:6px 14px;
           cursor:pointer; }
  button:hover { border-color:var(--accent); }
  #btnPlay { min-width:52px; font-weight:700; color:#0b0f16; background:var(--accent);
             border-color:var(--accent); }
  #time { font-variant-numeric:tabular-nums; color:var(--dim); font-size:14px; }
  #chaplabel { color:var(--gold); font-size:14px; flex:1 1 auto; white-space:nowrap;
               overflow:hidden; text-overflow:ellipsis; }
  #hint { margin:6px 0 0; color:#5f6c7d; font-size:12px; }
  #btnAsk { color:#0b0f16; background:var(--gold); border-color:var(--gold); font-weight:700; }

  /* AI tutor drawer */
  #ai { position:fixed; top:0; right:0; bottom:0; width:min(400px,100vw); z-index:50;
        display:flex; flex-direction:column; background:rgba(16,22,32,.97);
        border-left:1px solid var(--line); backdrop-filter:blur(6px);
        transform:translateX(103%); transition:transform .25s ease; }
  #ai.open { transform:none; }
  #aiHead { display:flex; align-items:center; gap:10px; padding:12px 14px;
            border-bottom:1px solid var(--line); }
  #aiHead b { font-size:15px; }
  #aiCtx { font-size:12px; color:var(--gold); flex:1; text-align:right;
           white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #aiClose { padding:2px 10px; font-size:16px; }
  #aiLog { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column;
           gap:10px; }
  .msg { max-width:88%; padding:9px 12px; border-radius:12px; font-size:14px;
         line-height:1.5; white-space:pre-wrap; overflow-wrap:anywhere; }
  .msg.user { align-self:flex-end; background:var(--accent); color:#0b0f16;
              border-bottom-right-radius:4px; }
  .msg.bot { align-self:flex-start; background:#1b2432; border:1px solid var(--line);
             border-bottom-left-radius:4px; }
  .msg.err { align-self:center; background:transparent; border:1px dashed var(--line);
             color:var(--dim); font-size:12.5px; text-align:center; }
  .msg.typing span { display:inline-block; width:6px; height:6px; margin:0 1.5px;
                     border-radius:50%; background:var(--dim); animation:blink 1.2s infinite; }
  .msg.typing span:nth-child(2){ animation-delay:.2s; }
  .msg.typing span:nth-child(3){ animation-delay:.4s; }
  @keyframes blink { 0%,80%,100%{opacity:.25} 40%{opacity:1} }
  #aiForm { display:flex; gap:8px; padding:12px 14px; border-top:1px solid var(--line); }
  #aiIn { flex:1; min-width:0; background:#101722; border:1px solid var(--line);
          color:var(--text); border-radius:8px; padding:8px 10px; font:inherit; }
  #aiIn:focus { outline:none; border-color:var(--accent); }
  #aiSend { background:var(--accent); color:#0b0f16; border:0; border-radius:8px;
            padding:8px 14px; font-weight:700; cursor:pointer; }
  #aiClear { background:transparent; border:1px solid var(--line); color:var(--dim);
             border-radius:8px; padding:8px 10px; cursor:pointer; }

  :fullscreen { background:var(--bg); }
  :fullscreen header, :fullscreen footer { display:none; }
  :fullscreen main { padding:0; }
  :fullscreen #stagebox { max-width:100vw; border:0; border-radius:0; }
</style>
</head>
<body>
<div id="app">
  <header>
    <div class="title-row">
      <h1>How does a machine <b>learn to read</b>?</h1>
      <span class="total" id="total"></span>
    </div>
    <nav id="chips"></nav>
  </header>
  <main><div id="stagebox"><iframe id="frame" title="scene"></iframe></div></main>
  <footer>
    <div id="bar"><div class="rail"></div><div class="fill" id="fill"></div>
      <div class="knob" id="knob"></div></div>
    <div id="controls">
      <button id="btnPrev" title="previous chapter">&#8249;&#8249;</button>
      <button id="btnPlay" title="play / pause (space)">&#9654;</button>
      <button id="btnNext" title="next chapter">&#8250;&#8250;</button>
      <span id="time">0:00 / 0:00</span>
      <span id="chaplabel"></span>
      <button id="btnAsk" title="ask the AI tutor (a)">Ask AI</button>
      <button id="btnFull" title="fullscreen (f)">Fullscreen</button>
    </div>
    <p id="hint">Space play/pause &middot; &larr;/&rarr; &plusmn;1&nbsp;s (Shift &plusmn;5&nbsp;s) &middot;
      &uarr;/&darr; chapter &middot; F fullscreen &middot; A ask the AI tutor &middot; click or drag the bar to scrub</p>
  </footer>
  <aside id="ai">
    <div id="aiHead"><b>Ask the AI tutor</b><span id="aiCtx"></span>
      <button id="aiClose" title="close">&times;</button></div>
    <div id="aiLog"></div>
    <form id="aiForm">
      <button type="button" id="aiClear" title="clear chat">Clear</button>
      <input id="aiIn" autocomplete="off" placeholder="Ask about this chapter...">
      <button id="aiSend" type="submit">Send</button>
    </form>
  </aside>
</div>
<script>
'use strict';
const SCENES = __PAYLOAD__;
const TOTAL = __TOTAL__;

const $ = id => document.getElementById(id);
const frame = $('frame'), fill = $('fill'), knob = $('knob'), bar = $('bar');
const timeEl = $('time'), chapEl = $('chaplabel'), chips = $('chips');

function fmt(t){ t = Math.max(0, Math.floor(t));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
$('total').textContent = fmt(TOTAL) + ' \u00b7 ' + SCENES.length + ' chapters \u00b7 1080p';

/* chapter chips + boundary ticks */
const chipEls = SCENES.map((s, i) => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = (i + 1) + ' ' + s.short;
  b.title = s.title + ' \u2014 ' + fmt(s.start);
  b.onclick = () => seekTo(s.start + 0.01);
  chips.appendChild(b);
  return b;
});
SCENES.slice(1).forEach(s => {
  const t = document.createElement('div');
  t.className = 'tick'; t.style.left = (100 * s.start / TOTAL) + '%';
  bar.appendChild(t);
});

/* master clock: one global timeline, scenes swapped via srcdoc,
   driven through the scenes' documented hf-seek contract */
let gT = 0, playing = false, idx = -1, lastNow = 0;

function sceneAt(t){
  for (let i = 0; i < SCENES.length; i++) if (t < SCENES[i].end) return i;
  return SCENES.length - 1;
}
function setPlaying(p){
  playing = p;
  if (p) lastNow = performance.now();
  $('btnPlay').innerHTML = p ? '&#10074;&#10074;' : '&#9654;';
}
function seekTo(t){
  gT = Math.min(Math.max(t, 0), TOTAL - 0.001);
}
function togglePlay(){
  if (!playing && gT >= TOTAL - 0.05) gT = 0;   // replay from start
  setPlaying(!playing);
}

function tick(now){
  requestAnimationFrame(tick);
  if (playing){
    gT += (now - lastNow) / 1000; lastNow = now;
    if (gT >= TOTAL){ gT = TOTAL - 0.001; setPlaying(false); }
  }
  const i = sceneAt(gT);
  if (i !== idx){
    idx = i; frame.srcdoc = SCENES[i].html;
    if (ai.classList.contains('open'))
      aiCtx.textContent = 'ch ' + (i + 1) + ' \u00b7 ' + SCENES[i].title;
  }
  const s = SCENES[i];
  const localT = Math.min(gT - s.start, s.dur);
  try { frame.contentWindow.postMessage({ type:'hf-seek', t: localT }, '*'); }
  catch (e) {}
  chipEls.forEach((c, k) => c.classList.toggle('on', k === i));
  chapEl.textContent = (i + 1) + '/12 \u00b7 ' + s.title;
  const pct = 100 * gT / TOTAL;
  fill.style.width = pct + '%'; knob.style.left = pct + '%';
  timeEl.textContent = fmt(gT) + ' / ' + fmt(TOTAL);
}
requestAnimationFrame(tick);
setPlaying(true);

/* scrubbing */
let scrubbing = false;
function barSeek(ev){
  const r = bar.getBoundingClientRect();
  seekTo(TOTAL * (ev.clientX - r.left) / r.width);
}
bar.addEventListener('pointerdown', ev => {
  scrubbing = true; bar.setPointerCapture(ev.pointerId); barSeek(ev);
});
bar.addEventListener('pointermove', ev => { if (scrubbing) barSeek(ev); });
bar.addEventListener('pointerup',   () => { scrubbing = false; });

/* controls */
$('btnPlay').onclick = togglePlay;
$('btnPrev').onclick = () => { const i = sceneAt(gT);
  seekTo(gT - SCENES[i].start < 1.5 && i > 0 ? SCENES[i-1].start + 0.01 : SCENES[i].start + 0.01); };
$('btnNext').onclick = () => { const i = sceneAt(gT);
  seekTo(i < SCENES.length - 1 ? SCENES[i+1].start + 0.01 : TOTAL - 0.01); };
$('btnFull').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
};
window.addEventListener('keydown', e => {
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.code === 'Space'){ e.preventDefault(); togglePlay(); }
  else if (e.key === 'ArrowRight') seekTo(gT + (e.shiftKey ? 5 : 1));
  else if (e.key === 'ArrowLeft')  seekTo(gT - (e.shiftKey ? 5 : 1));
  else if (e.key === 'ArrowDown')  $('btnPrev').onclick();
  else if (e.key === 'ArrowUp')    $('btnNext').onclick();
  else if (e.key === 'f' || e.key === 'F') $('btnFull').onclick();
  else if (e.key === 'a' || e.key === 'A') aiToggle();
});

/* -------- AI tutor drawer — keyless GLM via the companion server ------- */
const ai = $('ai'), aiLog = $('aiLog'), aiIn = $('aiIn'), aiCtx = $('aiCtx');
const aiHistory = [];
let aiBusy = false;
function aiToggle(open){
  const willOpen = open === undefined ? !ai.classList.contains('open') : open;
  ai.classList.toggle('open', willOpen);
  if (willOpen){
    aiCtx.textContent = 'ch ' + (idx + 1) + ' \u00b7 ' + SCENES[idx].title;
    aiIn.focus();
  }
}
$('btnAsk').onclick  = () => aiToggle();
$('aiClose').onclick = () => aiToggle(false);
$('aiClear').onclick = () => { aiLog.innerHTML = ''; aiHistory.length = 0; aiIn.focus(); };
function aiMsg(cls, text){
  const d = document.createElement('div');
  d.className = 'msg ' + cls;
  if (cls === 'typing') d.innerHTML = '<span></span><span></span><span></span>';
  else d.textContent = text;
  aiLog.appendChild(d);
  aiLog.scrollTop = aiLog.scrollHeight;
  return d;
}
$('aiForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const q = aiIn.value.trim();
  if (!q || aiBusy) return;
  aiIn.value = '';
  aiMsg('user', q);
  const typ = aiMsg('typing', '');
  aiBusy = true;
  try {
    const r = await fetch('/api/ask', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, chapter: idx, t: gT,
                             history: aiHistory.slice(-6) }) });
    const j = await r.json();
    if (!j.answer) throw new Error(j.error || 'empty answer');
    aiMsg('bot', j.answer);
    aiHistory.push({ role: 'user', content: q }, { role: 'assistant', content: j.answer });
  } catch (e) {
    aiMsg('err', 'AI tutor is offline \u2014 it talks to GLM through its keyless server. '
      + 'From the project folder run:  bun glm_server.mjs   then open '
      + (location.protocol.indexOf('http') === 0 ? location.origin : 'http://localhost:8787'));
  } finally {
    typ.remove(); aiBusy = false; aiIn.focus();
  }
});

/* tiny automation API (QA / scripting) */
window.__player = {
  seek(t){ seekTo(+t || 0); },
  play(){ setPlaying(true); }, pause(){ setPlaying(false); },
  get time(){ return gT; }, get scene(){ return idx; },
  ask(){ return aiToggle(); }
};
</script>
</body>
</html>
'''

page = page.replace('__PAYLOAD__', payload).replace('__TOTAL__', repr(TOTAL))
OUT.write_text(page)
print(f'wrote {OUT} ({OUT.stat().st_size/1024:.0f} KB)')
