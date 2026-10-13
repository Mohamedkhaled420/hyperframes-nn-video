#!/usr/bin/env python3
"""export_pack.py — render a Hyperframes scenes folder to a finished MP4.

Stages (mirrors the pipeline that produced the bundled master):
  1. render  : Playwright frame-steps every scene's deterministic render(t)
               (30 fps, 1280x720, JPEG q85)   [2 parallel workers]
  2. encode  : ffmpeg libx264 per scene -> part files
  3. audio   : optional — mix per-line TTS wavs (LNN.wav) into scene tracks,
               mux into parts, build narration_full.m4a
  4. concat  : final MP4 (+faststart) at --out

Live progress is written to --status as JSON:
  { phase, pct, scene, scenes_done, frames_done, frames_total, log: [...] }

Usage:
  python3 export_pack.py --root <scenesRoot> --out <final.mp4>
                         [--status <status.json>] [--fps 30]
                         [--audio-lines-root <dir with <scene>/LNN.wav>]
                         [--work <scratch dir>]

<scenesRoot> must contain s*_*/index.html with data-composition-duration,
or a jobs.csv whose `folder` column lists the scene order.
"""
import json, re, subprocess, sys, time
from multiprocessing import Pool, Value
from pathlib import Path
from playwright.sync_api import sync_playwright

def argval(name, default=None):
    a = sys.argv
    return a[a.index(name) + 1] if name in a else default

ROOT = Path(argval('--root')).resolve()
OUT = Path(argval('--out')).resolve()
STATUS = Path(argval('--status')) if '--status' in sys.argv else None
FPS = int(argval('--fps', '30'))
AUDROOT = Path(argval('--audio-lines-root')) if '--audio-lines-root' in sys.argv else None
WORK = Path(argval('--work', str(ROOT / '.export'))).resolve()
W, H = 1280, 720

LOG = []
def log(msg):
    line = f'[{time.strftime("%H:%M:%S")}] {msg}'
    LOG.append(line)
    print(msg, flush=True)
    write_status()

def write_status(**kw):
    if not STATUS:
        return
    st = {'phase': PHASE[0], 'pct': PCT[0], 'scene': kw.get('scene', ''),
          'scenes_done': kw.get('scenes_done', DONE.value),
          'frames_done': kw.get('frames_done', FRAMES.value),
          'frames_total': TOTAL_FRAMES[0], 'log': LOG[-14:]}
    tmp = STATUS.with_suffix('.tmp')
    tmp.write_text(json.dumps(st))
    tmp.replace(STATUS)

PHASE = ['starting']; PCT = [0.0]
DONE = Value('i', 0)          # scenes completed
FRAMES = Value('i', 0)        # frames completed
TOTAL_FRAMES = [0]

# ------------------------------------------------------------------ scenes --
def scene_folders():
    jc = ROOT / 'jobs.csv'
    if jc.exists():
        import csv
        with open(jc, newline='') as f:
            return [r['folder'].strip() for r in csv.DictReader(f) if r.get('folder')]
    return sorted(p.name for p in ROOT.iterdir()
                  if p.is_dir() and re.match(r'^s\d\d_', p.name))

SCENES = scene_folders()
if not SCENES:
    sys.exit('no scene folders found in ' + str(ROOT))
DUR = {}
for s in SCENES:
    html = (ROOT / s / 'index.html').read_text()
    m = re.search(r'data-composition-duration="([0-9.]+)"', html)
    if not m:
        sys.exit(f'{s}: no data-composition-duration')
    DUR[s] = float(m.group(1))
TOTAL_FRAMES[0] = sum(round(DUR[s] * FPS) for s in SCENES)

FRAMES_DIR = WORK / 'frames'
VIDS_DIR = WORK / 'video'
AUD_DIR = WORK / 'audio'
for d in (FRAMES_DIR, VIDS_DIR, AUD_DIR):
    d.mkdir(parents=True, exist_ok=True)
OUT.parent.mkdir(parents=True, exist_ok=True)

# --------------------------------------------------------------- preflight --
# every scene must boot and expose window.__scene before we spend minutes
# rendering frames (surfaces GLM scene bugs as a clear error, not a crash)
_broken = []
with sync_playwright() as pw:
    _b = pw.chromium.launch(args=['--hide-scrollbars', '--force-color-profile=srgb'])
    for _s in SCENES:
        _pg = _b.new_page(viewport={'width': W, 'height': H})
        try:
            _pg.goto(f'file://{ROOT / _s / "index.html"}#freeze')
            _pg.wait_for_timeout(400)
            if not _pg.evaluate('typeof window.__scene === "object" && !!window.__scene'):
                _broken.append(_s)
        except Exception:
            _broken.append(_s)
        _pg.close()
    _b.close()
if _broken:
    PHASE[0] = 'error'
    print('SCENES FAILED TO BOOT: ' + ', '.join(_broken) +
          ' (regenerate the pack or fix these scenes)', flush=True)
    write_status()
    sys.exit(3)

# ----------------------------------------------------------------- render ---
def worker(scene):
    outdir = FRAMES_DIR / scene
    outdir.mkdir(parents=True, exist_ok=True)
    n = round(DUR[scene] * FPS)
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=['--hide-scrollbars', '--force-color-profile=srgb'])
        pg = b.new_page(viewport={'width': W, 'height': H})
        pg.goto(f'file://{ROOT / scene / "index.html"}#freeze')
        pg.wait_for_timeout(500)
        for i in range(n):
            fp = outdir / f'{i + 1:05d}.jpg'
            if not fp.exists():
                pg.evaluate(f'window.__scene.render({i / FPS:.6f})')
                pg.screenshot(path=str(fp), type='jpeg', quality=85)
            with FRAMES.get_lock():
                FRAMES.value += 1
            if i % 15 == 0:
                PCT[0] = 2 + 60 * FRAMES.value / max(1, TOTAL_FRAMES[0])
                write_status(scene=scene)
        b.close()
    return scene, n

# ----------------------------------------------------------------- audio ----
def probe(f):
    try:
        return float(subprocess.run(['ffprobe', '-v', 'quiet', '-show_entries',
                                     'format=duration', '-of', 'csv=p=0', str(f)],
                                    capture_output=True, text=True).stdout.strip())
    except Exception:
        return 0.0

def mix_scene_audio(scene, wav_dir):
    """Per-line TTS wavs -> one scene track (ported from encode_audio.py)."""
    dur = DUR[scene]
    out = AUD_DIR / f'{scene}.wav'
    files = sorted(wav_dir.glob('L*.wav'))
    files = [f for f in files if f.stat().st_size > 4000]
    if not files:
        return None
    inputs = ['-f', 'lavfi', '-t', f'{dur:.3f}', '-i', 'anullsrc=r=24000:cl=mono']
    fc, mix = [], '[0:a]'
    # line windows: LNN order maps to narr order; spread evenly if manifest absent
    narr = []
    m = re.search(r'const DATA = (\{.*?\});\n', (ROOT / scene / 'index.html').read_text(), re.S)
    if m:
        narr = json.loads(m.group(1)).get('narr', [])
    for k, f in enumerate(files, start=1):
        start = narr[k - 1][0] if k - 1 < len(narr) else 0.0
        win = narr[k - 1][1] if k - 1 < len(narr) else dur
        d = probe(f)
        tempo = ''
        over = d - (win + 0.6)
        if over > 0 and win >= 2:
            t = min(1.45, max(1.01, (over + win + 0.6) / (win + 0.6)))
            tempo = f'atempo={t:.4f},'
        ms = max(0, int(round(start * 1000)))
        fc.append(f'[{k}:a]{tempo}adelay={ms}:all=1[a{k}]')
        mix += f'[a{k}]'
        inputs += ['-i', str(f)]
    fc.append(f'{mix}amix=inputs={len(files) + 1}:normalize=0:duration=first,'
              f'aresample=44100,aformat=sample_fmts=s16:channel_layouts=stereo[out]')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error'] + inputs +
                   ['-filter_complex', ';'.join(fc), '-map', '[out]',
                    '-t', f'{dur:.3f}', str(out)], check=True)
    return out

def run(cmd):
    subprocess.run(cmd, check=True)

# ------------------------------------------------------------------ main ----
log(f'export: {len(SCENES)} scenes, {TOTAL_FRAMES[0]} frames @ {FPS} fps -> {OUT.name}')

PHASE[0] = 'render'; write_status()
t0 = time.time()
with Pool(2) as pool:
    for scene, n in pool.imap_unordered(worker, SCENES):
        with DONE.get_lock():
            DONE.value += 1
        log(f'rendered {scene}: {n} frames ({time.time() - t0:.0f}s elapsed)')

PHASE[0] = 'encode'; PCT[0] = 64; write_status()
parts = []
for s in SCENES:
    part = VIDS_DIR / f'{s}.mp4'
    if not part.exists():
        run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS),
             '-start_number', '1', '-i', str(FRAMES_DIR / s / '%05d.jpg'),
             '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
             '-pix_fmt', 'yuv420p', '-r', str(FPS), str(part)])
    parts.append(part)
    PCT[0] = 64 + 14 * (len(parts) / len(SCENES)); write_status(scene=s)
    log(f'encoded {s}')

PHASE[0] = 'audio'; PCT[0] = 80; write_status()
final_parts = []
for i, s in enumerate(SCENES):
    part = VIDS_DIR / f'{s}.mp4'
    wav = None
    if AUDROOT and (AUDROOT / s).exists():
        try:
            wav = mix_scene_audio(s, AUDROOT / s)
        except Exception as e:
            log(f'audio mix failed for {s}: {e}')
    if wav:
        fp = VIDS_DIR / f'mux_{s}.mp4'
        run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(part), '-i', str(wav),
             '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
             '-movflags', '+faststart', '-shortest', str(fp)])
        final_parts.append(fp)
    else:
        # silent track so concat stays uniform
        fp = VIDS_DIR / f'mux_{s}.mp4'
        run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(part),
             '-f', 'lavfi', '-t', f'{DUR[s]:.3f}', '-i', 'anullsrc=r=44100:cl=stereo',
             '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest',
             '-movflags', '+faststart', str(fp)])
        final_parts.append(fp)
    PCT[0] = 80 + 12 * (i + 1) / len(SCENES); write_status(scene=s)
    log(f'audio {s}: {"narration" if wav else "silent"}')

# narration-only track
if AUDROOT:
    nl = AUD_DIR / 'narr_list.txt'
    rows = []
    for s in SCENES:
        if (AUD_DIR / f'{s}.wav').exists():
            rows.append(f"file '{AUD_DIR / s}.wav'\n")
    if rows:
        nl.write_text(''.join(rows))
        run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0',
             '-i', str(nl), '-c:a', 'aac', '-b:a', '160k',
             str(OUT.parent / (OUT.stem + '_narration.m4a'))])

PHASE[0] = 'concat'; PCT[0] = 94; write_status()
lst = WORK / 'concat.txt'
lst.write_text(''.join(f"file '{p}'\n" for p in final_parts))
run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0',
     '-i', str(lst), '-c', 'copy', '-movflags', '+faststart', str(OUT)])

PHASE[0] = 'done'; PCT[0] = 100
log(f'DONE {OUT} ({OUT.stat().st_size / 1e6:.1f} MB, {probe(OUT):.1f}s)')
write_status(scene='')
