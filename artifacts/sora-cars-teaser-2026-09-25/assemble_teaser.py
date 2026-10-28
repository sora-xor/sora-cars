#!/usr/bin/env python3
"""Finish a downloaded 30-second OpenArt/Seedance video with SORA music and title.

Usage: python3 assemble_teaser.py /absolute/path/to/downloaded-video.mp4
No input is generated or downloaded by this script. Existing output is preserved
unless --force is supplied. A bundled Python runtime supplies Pillow if needed.
"""

import argparse
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
FFMPEG = Path('/opt/homebrew/bin/ffmpeg')
FFPROBE = Path('/opt/homebrew/bin/ffprobe')
PYTHON = Path('/Users/takemiyamakoto/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3')
FONT = Path('/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf')
MUSIC = ROOT / 'public/assets/music/audio/outrun-the-dawn-preview.mp3'
OUTPUT = HERE / 'sora-cars-teaser-30s.mp4'
TITLE = HERE / 'title-overlay.png'
REFERENCE_NAMES = [
    '01-workshop.png', '02-garage.png', '03-radio.png', '04-harbor.png',
    '05-coastal-race.png', '06-sunrise-crew.png',
]


def probe(path):
    return json.loads(subprocess.check_output([
        str(FFPROBE), '-v', 'error', '-show_streams', '-show_format',
        '-of', 'json', str(path),
    ], text=True))


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def file_record(path):
    return {'path': str(path), 'bytes': path.stat().st_size, 'sha256': sha256(path)}


def render_title(width, height, destination):
    from PIL import Image, ImageDraw, ImageFilter, ImageFont

    # Native font and deterministic typesetting; no additional AI imagery.
    scale = 2
    canvas_size = (width * scale, height * scale)
    font_size = round(width * 0.047 * scale)
    font = ImageFont.truetype(str(FONT), font_size)
    tracking = width * 0.006 * scale
    label = 'SORA CARS'
    text_width = sum(font.getlength(char) for char in label) + tracking * (len(label) - 1)
    bbox = font.getbbox(label)
    x = (canvas_size[0] - text_width) / 2
    y = height * 0.86 * scale - (bbox[3] - bbox[1]) / 2 - bbox[1]

    def lettering(layer, color, offset_y=0):
        draw = ImageDraw.Draw(layer)
        cursor = x
        for char in label:
            draw.text((cursor, y + offset_y), char, font=font, fill=color)
            cursor += font.getlength(char) + tracking

    shadow = Image.new('RGBA', canvas_size, (0, 0, 0, 0))
    lettering(shadow, (0, 0, 0, 155), round(height * 0.002 * scale))
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(1, height * 0.0025 * scale)))
    ink = Image.new('RGBA', canvas_size, (0, 0, 0, 0))
    lettering(ink, (255, 239, 210, 255))
    title = Image.alpha_composite(shadow, ink)
    title.resize((width, height), Image.Resampling.LANCZOS).save(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input_video', type=Path, help='Downloaded 30-second Seedance 2.5 video')
    parser.add_argument('--force', action='store_true', help='Replace the previously assembled final video')
    args = parser.parse_args()
    source = args.input_video.expanduser().resolve()
    if not source.is_file():
        parser.error(f'Input video does not exist: {source}. Download it before assembly.')
    if source == OUTPUT.resolve():
        parser.error('The downloaded source must differ from the final output.')
    if OUTPUT.exists() and not args.force:
        parser.error(f'Output already exists: {OUTPUT}. Use --force only to replace it.')
    for dependency in (FFMPEG, FFPROBE, FONT, MUSIC):
        if not dependency.is_file():
            parser.error(f'Required local file is missing: {dependency}')

    try:
        import PIL  # noqa: F401
    except ImportError:
        if PYTHON.is_file() and Path(sys.executable).resolve() != PYTHON.resolve():
            os.execv(str(PYTHON), [str(PYTHON), str(Path(__file__).resolve()), *sys.argv[1:]])
        parser.error('Pillow is unavailable in both the current and bundled Python runtimes.')

    original = probe(source)
    video = next((s for s in original['streams'] if s['codec_type'] == 'video'), None)
    if video is None:
        parser.error('The supplied file has no video stream.')
    width, height = video['width'], video['height']
    if width % 2 or height % 2:
        parser.error('Input dimensions must be even to preserve them in H.264 yuv420p.')
    duration = float(video.get('duration') or original['format']['duration'])
    if not 29.5 <= duration <= 30.5:
        parser.error(f'Expected a roughly 30-second source; found {duration:.3f} seconds. No time stretching is performed.')
    try:
        source_fps = float(Fraction(video.get('avg_frame_rate', '0/1')))
        if source_fps <= 0:
            source_fps = float(Fraction(video['r_frame_rate']))
    except (ValueError, ZeroDivisionError, KeyError):
        parser.error('Could not determine the source frame rate.')
    fps = min((24, 30), key=lambda rate: abs(rate - source_fps))
    if abs(source_fps - fps) > 0.1:
        parser.error(f'Expected nominal 24 or 30 fps, found {source_fps:.6f}.')

    render_title(width, height, TITLE)
    graph = (
        f'[0:v:0]setpts=PTS-STARTPTS,fps={fps},'
        'tpad=stop_mode=clone:stop_duration=1,trim=duration=30,'
        'fade=t=in:st=0:d=0.2[base];'
        '[2:v:0]format=rgba,fade=t=in:st=27:d=0.4:alpha=1,'
        'fade=t=out:st=29.65:d=0.35:alpha=1[title];'
        '[base][title]overlay=x=0:y=0:format=auto:shortest=1,'
        'fade=t=out:st=29.8:d=0.2,format=yuv420p[v];'
        '[1:a:0]atrim=duration=30,asetpts=PTS-STARTPTS,'
        'apad=whole_dur=30,atrim=duration=30[a]'
    )
    partial = HERE / 'sora-cars-teaser-30s.partial.mp4'
    command = [
        str(FFMPEG), '-hide_banner', '-nostdin', '-y',
        '-i', str(source), '-i', str(MUSIC),
        '-loop', '1', '-framerate', str(fps), '-i', str(TITLE),
        '-filter_complex', graph, '-map', '[v]', '-map', '[a]',
        '-t', '30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
        '-pix_fmt', 'yuv420p', '-r', str(fps), '-fps_mode', 'cfr',
        '-c:a', 'aac', '-b:a', '320k', '-ar', '44100',
        '-map_metadata', '-1', '-metadata', 'title=SORA CARS — Teaser',
        '-metadata', 'artist=SORA CARS',
        '-metadata', 'comment=Original soundtrack: Outrun the Dawn. Video generated with Seedance 2.5 via OpenArt.',
        '-movflags', '+faststart', str(partial),
    ]
    print(f'Assembling {width}×{height} at {fps} fps with the original 30-second soundtrack.', flush=True)
    subprocess.run(command, check=True)
    finished = probe(partial)
    vout = next(s for s in finished['streams'] if s['codec_type'] == 'video')
    aout = next(s for s in finished['streams'] if s['codec_type'] == 'audio')
    if (vout['width'], vout['height']) != (width, height):
        raise RuntimeError('Output resolution unexpectedly changed.')
    if vout['codec_name'] != 'h264' or vout['pix_fmt'] != 'yuv420p':
        raise RuntimeError('Unexpected output video codec or pixel format.')
    if abs(float(finished['format']['duration']) - 30.0) > 0.001:
        raise RuntimeError('The output container is not exactly 30 seconds long.')
    if abs(float(vout['duration']) - 30.0) > 0.001:
        raise RuntimeError('The output video stream is not exactly 30 seconds long.')
    if aout['codec_name'] != 'aac':
        raise RuntimeError('Unexpected output audio codec.')
    partial.replace(OUTPUT)

    references = [HERE / 'references' / name for name in REFERENCE_NAMES]
    manifest = {
        'assembled_at_utc': datetime.now(timezone.utc).isoformat(),
        'generation': {
            'service': 'OpenArt', 'model': 'Seedance 2.5',
            'provenance_note': 'Workflow supplied by the operator; model identity is not inferred from video pixels.',
        },
        'input': {**file_record(source), 'probe': original},
        'soundtrack': {**file_record(MUSIC), 'title': 'Outrun the Dawn', 'artist': 'SORA CARS', 'bpm': 148},
        'artwork_references': [file_record(path) for path in references if path.is_file()],
        'title': {
            'text': 'SORA CARS', 'font': str(FONT), 'color': '#FFEFD2',
            'center_y_fraction': 0.86, 'start_seconds': 27, 'end_seconds': 30,
            'fade_in_seconds': 0.4, 'fade_out_start_seconds': 29.65,
        },
        'finishing': {
            'duration_seconds': 30, 'source_fps': source_fps, 'output_fps': fps,
            'fps_note': 'Exact 24/30 preserved; fractional 23.976/29.97 normalized to its nominal rate for an exact 30-second video.',
            'source_duration_seconds': duration,
            'timing_note': 'No speed change; at most 0.5 seconds trimmed or held at the end.',
            'generated_audio_replaced': True, 'soundtrack_time_stretched': False,
            'picture_fade_in_seconds': 0.2, 'picture_fade_out_seconds': 0.2,
            'video_crf': 17, 'video_preset': 'slow', 'audio_bitrate': '320k',
        },
        'ffmpeg_command': command,
        'output': {**file_record(OUTPUT), 'probe': finished},
    }
    (HERE / 'assembly-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Finished: {OUTPUT}\nManifest: {HERE / "assembly-manifest.json"}')


if __name__ == '__main__':
    main()
