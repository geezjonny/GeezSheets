#!/usr/bin/env python3
"""Turn a video into a seamless looping WebM for Owlbear (or any VTT) map backgrounds.

The end of the clip crossfades into its start, so the loop has no visible jump:

    python tools/make_loop.py river.mp4                      # whole video -> river.loop.webm
    python tools/make_loop.py river.mp4 --start 5 --length 20 --fade 2
    python tools/make_loop.py river.mp4 --width 2048 --fps 24 --crf 34 -o maps/river.webm
    python tools/make_loop.py already-loops.mp4 --fade 0      # just re-encode a clip that already loops

How the crossfade works: it reads LENGTH + FADE seconds from START. The output is LENGTH seconds long;
during its last FADE seconds the picture blends into the clip's first FADE seconds, so the final frame
is the frame the loop starts on.

Needs ffmpeg and ffprobe on PATH. Output is VP9 WebM with no sound (map backgrounds don't need it).
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path


def probe(path):
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration',
         '-of', 'json', str(path)], capture_output=True, text=True, check=True).stdout
    info = json.loads(out)
    s = info['streams'][0]
    num, den = (s.get('r_frame_rate') or '30/1').split('/')
    return float(info['format']['duration']), int(s['width']), int(s['height']), float(num) / float(den or 1)


def main():
    ap = argparse.ArgumentParser(description='Make a seamless looping WebM from a video.')
    ap.add_argument('video', type=Path)
    ap.add_argument('-o', '--out', type=Path, help='output file (default: <name>.loop.webm next to the input)')
    ap.add_argument('--start', type=float, default=0, help='seconds into the video to begin (default 0)')
    ap.add_argument('--length', type=float, help='loop length in seconds (default: as long as the video allows)')
    ap.add_argument('--fade', type=float, default=1.5, help='crossfade seconds; 0 = no crossfade (default 1.5)')
    ap.add_argument('--width', type=int, help='scale to this width, keeping the shape (e.g. 2048)')
    ap.add_argument('--fps', type=float, help='frame rate (default: keep the source rate)')
    ap.add_argument('--crf', type=int, default=32, help='quality: lower is better and bigger; 28-38 is sensible (default 32)')
    ap.add_argument('--fast', action='store_true', help='encode faster, slightly bigger file')
    a = ap.parse_args()

    if not a.video.exists():
        sys.exit(f'No such file: {a.video}')
    duration, w, h, fps = probe(a.video)
    fade = max(0.0, a.fade)
    room = duration - a.start
    length = a.length if a.length else room - fade
    if length <= 0 or a.start < 0:
        sys.exit(f'The video is {duration:.1f}s long: not enough for start {a.start}s + fade {fade}s.')
    if length + fade > room + 1e-3:
        sys.exit(f'Need {length + fade:.1f}s from {a.start}s but the video only has {room:.1f}s left. '
                 f'Use a shorter --length or --fade, or an earlier --start.')
    if fade > length / 2:
        sys.exit('--fade must be at most half of --length.')
    out = a.out or a.video.with_name(a.video.stem + '.loop.webm')
    rate = a.fps or fps

    # every frame gets the same size, rate and timing before the crossfade, which xfade requires
    prep = [f'fps={rate:g}', 'format=yuv420p', 'setsar=1']
    if a.width:
        prep.insert(0, f'scale={a.width}:-2:flags=lanczos')
    prep = ','.join(prep)
    if fade > 0:
        graph = (f'[0:v]{prep},split[a][b];'
                 f'[a]trim={fade}:{length + fade},setpts=PTS-STARTPTS[body];'
                 f'[b]trim=0:{fade},setpts=PTS-STARTPTS[head];'
                 f'[body][head]xfade=transition=fade:duration={fade}:offset={length - fade},format=yuv420p[v]')
    else:
        graph = f'[0:v]{prep},trim=0:{length},setpts=PTS-STARTPTS[v]'

    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-stats', '-y',
           '-ss', f'{a.start}', '-t', f'{length + fade}', '-i', str(a.video),
           '-filter_complex', graph, '-map', '[v]', '-an',
           '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', str(a.crf), '-row-mt', '1',
           '-deadline', 'good', '-cpu-used', '4' if a.fast else '2',
           '-g', str(max(1, round(rate * 2))), str(out)]
    print(f'{a.video.name}: {w}x{h} @ {fps:g} fps, {duration:.1f}s -> {length:g}s loop'
          + (f' with a {fade:g}s crossfade' if fade else '') + f' -> {out}')
    subprocess.run(cmd, check=True)
    size = out.stat().st_size / 1e6
    print(f'Done: {out} ({size:.1f} MB)')


if __name__ == '__main__':
    main()
