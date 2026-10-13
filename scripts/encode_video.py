#!/usr/bin/env python3
"""Encode all 12 scene frame sequences (JPEG) to H.264 video tracks.
Runs while TTS generates; audio is muxed later by encode_audio.py."""
import re, subprocess, sys, time
from multiprocessing import Pool
from pathlib import Path

ROOT = Path('/home/z/my-project/download/hyperframes_nn_video')
FRAMES = Path('/home/z/my-project/scripts/build/frames')
VIDS = Path('/home/z/my-project/scripts/build/video')
VIDS.mkdir(parents=True, exist_ok=True)

SCENES = sorted(p.name for p in ROOT.iterdir() if p.is_dir() and re.match(r'^s\d\d_', p.name))


def encode(folder):
    dur = float(re.search(r'data-composition-duration="([0-9.]+)"',
                          (ROOT / folder / 'index.html').read_text()).group(1))
    out = VIDS / f'{folder}.mp4'
    if out.exists():
        return folder, 'skip'
    cmd = ['ffmpeg', '-y', '-loglevel', 'error',
           '-framerate', '30', '-start_number', '1',
           '-i', str(FRAMES / folder / '%05d.jpg'),
           '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
           '-pix_fmt', 'yuv420p', '-r', '30', str(out)]
    t0 = time.time()
    subprocess.run(cmd, check=True)
    return folder, f'{time.time() - t0:.0f}s'


if __name__ == '__main__':
    with Pool(2) as pool:
        for folder, res in pool.imap_unordered(encode, SCENES):
            print(f'{folder}: {res}', flush=True)
    print('ALL VIDEO TRACKS ENCODED', flush=True)
