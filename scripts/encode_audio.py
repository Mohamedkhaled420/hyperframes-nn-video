#!/usr/bin/env python3
"""Hybrid narration mix + mux + concat.

Scene audio sources (per scene, whichever is complete):
  A. per-line clips (scripts/build/tts/<scene>/LNN.wav) -> exact caption sync
  B. one scene-level clip (scripts/build/tts_scene/<scene>.wav) -> placed at
     the first caption start, atempo-fitted to the caption span if too long
Then: mux with encoded video, concat 12 parts, narration-only track.
"""
import json, re, subprocess, time
from pathlib import Path

ROOT = Path('/home/z/my-project/download/hyperframes_nn_video')
TTS = Path('/home/z/my-project/scripts/build/tts')
TSC = Path('/home/z/my-project/scripts/build/tts_scene')
VIDS = Path('/home/z/my-project/scripts/build/video')
AUD = Path('/home/z/my-project/scripts/build/audio')
FINAL = Path('/home/z/my-project/download/hyperframes_nn_video/render')
AUD.mkdir(parents=True, exist_ok=True)
FINAL.mkdir(parents=True, exist_ok=True)

SCENES = sorted(p.name for p in ROOT.iterdir() if p.is_dir() and re.match(r'^s\d\d_', p.name))
NARR = {}
for s in SCENES:
    m = re.search(r'const DATA = (\{.*?\});\n',
                  (ROOT / s / 'index.html').read_text(), re.S)
    NARR[s] = json.loads(m.group(1))['narr']
DUR = {s: float(re.search(r'data-composition-duration="([0-9.]+)"',
                          (ROOT / s / 'index.html').read_text()).group(1)) for s in SCENES}


def scene_lines(s):
    """Return mode + audio info for a scene."""
    files = []
    for i, (start, win, _txt) in enumerate(NARR[s]):
        p = TTS / s / f'L{i:02d}.wav'
        if not p.exists() or p.stat().st_size < 4000:
            return None
        files.append({'start': start, 'win': win, 'file': str(p)})
    return {'mode': 'lines', 'lines': files}


def scene_clip(s):
    mf = TSC / 'manifest.json'
    if not mf.exists():
        return None
    m = json.loads(mf.read_text())
    if s not in m:
        return None
    e = m[s]
    if not Path(e['file']).exists():
        return None
    return {'mode': 'clip', 'file': e['file'], 'dur': e['dur'],
            'startAt': e['startAt'], 'spanEnd': e['spanEnd']}


def wait_until_covered():
    print('waiting for TTS coverage (lines or scene clips)...', flush=True)
    while True:
        missing = [s for s in SCENES if not scene_lines(s) and not scene_clip(s)]
        if not missing:
            return
        print(f'  still missing: {", ".join(missing)}', flush=True)
        time.sleep(60)


def mix_scene(s):
    dur = DUR[s]
    out = AUD / f'{s}.wav'
    info = scene_lines(s) or scene_clip(s)
    inputs = ['-f', 'lavfi', '-t', f'{dur:.3f}', '-i', 'anullsrc=r=24000:cl=mono']
    fc, mix_ins = [], '[0:a]'

    if info['mode'] == 'lines':
        for k, ln in enumerate(info['lines'], start=1):
            tempo = ''
            over = ln['dur'] if 'dur' in ln else None
            # per-line fit if we know the clip duration (probe via ffprobe)
            if over is None:
                try:
                    d = float(subprocess.run(
                        ['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
                         '-of', 'csv=p=0', ln['file']], capture_output=True,
                        text=True).stdout.strip())
                except Exception:
                    d = 0
                over = d - (ln['win'] + 0.6)
            if over > 0 and ln['win'] >= 2:
                t = min(1.45, max(1.01, (over + ln['win'] + 0.6) / (ln['win'] + 0.6)))
                tempo = f'atempo={t:.4f},'
            ms = max(0, int(round(ln['start'] * 1000)))
            fc.append(f'[{k}:a]{tempo}adelay={ms}:all=1[a{k}]')
            mix_ins += f'[a{k}]'
            inputs += ['-i', ln['file']]
        n = len(info['lines'])
    else:
        # one clip per scene: start at first caption, fit to caption span
        tempo = ''
        span = info['spanEnd'] - info['startAt']
        if info['dur'] > span + 0.8:
            tempo = f'atempo={min(1.9, info["dur"] / (span + 0.8)):.4f},'
        ms = max(0, int(round(info['startAt'] * 1000)))
        fc.append(f'[1:a]{tempo}adelay={ms}:all=1,apad[a1]')
        mix_ins += '[a1]'
        inputs += ['-i', info['file']]
        n = 1

    fc.append(f'{mix_ins}amix=inputs={n + 1}:normalize=0:duration=first,'
              f'aresample=44100,aformat=sample_fmts=s16:channel_layouts=stereo[out]')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error'] + inputs +
                   ['-filter_complex', ';'.join(fc), '-map', '[out]',
                    '-t', f'{dur:.3f}', str(out)], check=True)
    return out


def run(cmd):
    subprocess.run(cmd, check=True)


def main():
    wait_until_covered()

    scene_audios = {}
    for s in SCENES:
        scene_audios[s] = mix_scene(s)
        print(f'audio {s}: {"lines" if scene_lines(s) else "clip"}', flush=True)

    parts = []
    for s in SCENES:
        part = FINAL / f'{s}.mp4'
        run(['ffmpeg', '-y', '-loglevel', 'error',
             '-i', str(VIDS / f'{s}.mp4'), '-i', str(scene_audios[s]),
             '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
             '-movflags', '+faststart', '-shortest', str(part)])
        parts.append(part)
        print(f'mux {s}', flush=True)

    lst = FINAL / 'concat.txt'
    lst.write_text(''.join(f"file '{p.name}'\n" for p in parts))
    final = FINAL / 'how_machines_learn_to_read_720p.mp4'
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0',
         '-i', str(lst), '-c', 'copy', '-movflags', '+faststart', str(final)])

    nl = AUD / 'narr_list.txt'
    nl.write_text(''.join(f"file '{AUD}/{s}.wav'\n" for s in SCENES))
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0',
         '-i', str(nl), '-c:a', 'aac', '-b:a', '160k',
         str(FINAL / 'narration_full.m4a')])
    print('FINAL DONE', flush=True)


if __name__ == '__main__':
    main()
