#!/usr/bin/env python3
"""Losslessly encode startup art/font; preserve originals, every pixel, alpha and glyph.
Requires cwebp, Pillow and fonttools[woff]. No font subsetting or image resizing.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib, json, subprocess, struct
import fontTools
from PIL import Image
from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import WOFF2FlavorData

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/assets'
OUT = ASSETS / 'startup-optimized/v1'
IMAGES = ['sprites/street-people.png', 'sprites/window-interiors.png', 'alpine-dusk.png', 'story/angles/garage-wide-v2.png']

def digest(raw): return hashlib.sha256(raw).hexdigest()
def record(source, dest, **verification):
    a, b = source.read_bytes(), dest.read_bytes()
    assert len(b) < len(a), f'encoding is not smaller: {source}'
    return {'source': 'assets/' + source.relative_to(ASSETS).as_posix(), 'sourceBytes': len(a), 'sourceSha256': digest(a), 'path': 'assets/' + dest.relative_to(ASSETS).as_posix(), 'bytes': len(b), 'sha256': digest(b), 'verification': verification}

def convert_image(name):
    source = ASSETS / name
    dest = OUT / Path(name).with_suffix('.webp')
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['cwebp', '-quiet', '-lossless', '-exact', '-m', '6', '-q', '100', '-metadata', 'all', str(source), '-o', str(dest)], check=True)
    with Image.open(source) as original, Image.open(dest) as encoded:
        assert original.size == encoded.size
        a, b = original.convert('RGBA').tobytes(), encoded.convert('RGBA').tobytes()
        assert a == b, f'RGBA mismatch: {name}'
        assert original.info.get('icc_profile') == encoded.info.get('icc_profile'), f'ICC profile mismatch: {name}'
        return record(source, dest, width=original.width, height=original.height, decodedRgbaSha256=digest(a), exactRgbaAndAlpha=True, iccProfilePreserved=True)

def normalize_head(raw):
    # WOFF2 sets the lossless font-data optimization bit and recomputes the SFNT checksum.
    # These do not change glyphs, metrics, shaping or variation behavior.
    data = bytearray(raw)
    data[8:12] = b'\0' * 4
    flags = struct.unpack_from('>H', data, 16)[0] & ~(1 << 11)
    struct.pack_into('>H', data, 16, flags)
    return bytes(data)

def convert_font():
    source = ASSETS / 'fonts/noto-sans-jp.woff'
    dest = OUT / 'fonts/noto-sans-jp.woff2'
    dest.parent.mkdir(parents=True, exist_ok=True)
    font = TTFont(source, recalcBBoxes=False, recalcTimestamp=False)
    font.flavor = 'woff2'
    # Disable glyf/loca transforms: retain exact decompressed table bytes, not just equal outlines.
    font.flavorData = WOFF2FlavorData(transformedTables=set())
    font.save(dest, reorderTables=False)
    with TTFont(source, recalcBBoxes=False, recalcTimestamp=False) as original, TTFont(dest, recalcBBoxes=False, recalcTimestamp=False) as encoded:
        assert sorted(original.reader.keys()) == sorted(encoded.reader.keys())
        tables = {}
        for tag in original.reader.keys():
            a, b = original.reader[tag], encoded.reader[tag]
            if tag == 'head': a, b = normalize_head(a), normalize_head(b)
            assert a == b, f'font table differs: {tag}'
            tables[tag] = digest(a)
        assert original.getGlyphOrder() == encoded.getGlyphOrder()
        assert original.getBestCmap() == encoded.getBestCmap()
        return record(source, dest, allTablesEqualExceptHeadStorageFlagsAndChecksum=True, tablesSha256=tables, glyphCount=len(original.getGlyphOrder()), unicodeMappings=len(original.getBestCmap()), subset=False, license='assets/fonts/noto-sans-jp-OFL.txt')

if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=4) as pool:
        images = list(pool.map(convert_image, IMAGES))
    rows = sorted(images + [convert_font()], key=lambda item: item['source'])
    report = {'schema': 'sora-cars.lossless-startup-assets.v1', 'sourceFilesPreserved': True, 'imageEncoder': subprocess.check_output(['cwebp', '-version'], text=True).strip(), 'imageOptions': ['-lossless', '-exact', '-m', '6', '-q', '100', '-metadata', 'all'], 'fontEncoder': f'fontTools {fontTools.__version__} WOFF2 without table transforms', 'assets': rows, 'sourceBytes': sum(row['sourceBytes'] for row in rows), 'bytes': sum(row['bytes'] for row in rows)}
    (OUT / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n')
    (ROOT / 'src/startup-assets.generated.json').write_text(json.dumps({row['source']: row['path'] for row in rows}, indent=2) + '\n')
    (ROOT / 'src/startup-asset-sizes.generated.json').write_text(json.dumps({row['path']: row['bytes'] for row in rows}, indent=2) + '\n')
    print(json.dumps({'sourceBytes': report['sourceBytes'], 'bytes': report['bytes'], 'savedBytes': report['sourceBytes'] - report['bytes'], 'assets': [{key: row[key] for key in ['source', 'sourceBytes', 'path', 'bytes']} for row in rows]}, indent=2))
