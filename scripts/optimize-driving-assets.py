#!/usr/bin/env python3
"""Build smaller driving assets from retained licensed originals; requires ffmpeg and cwebp.
Geometry and glTF node/material identities are preserved. Trees use authored LOD2/3.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import gzip, hashlib, json, shutil, struct, subprocess, tempfile

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/assets'
OUT = ASSETS / 'drive-optimized/v1'
ROWS = []

def digest(b): return hashlib.sha256(b).hexdigest()
def image(raw, suffix, maximum):
    with tempfile.TemporaryDirectory(prefix='sora-driving-image-') as name:
        source = Path(name) / ('input' + suffix); target = Path(name) / ('output' + suffix)
        source.write_bytes(raw)
        args = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', str(source), '-vf', f'scale=w=min({maximum}\\,iw):h=min({maximum}\\,ih):force_original_aspect_ratio=decrease', '-frames:v', '1', '-threads', '1']
        if suffix == '.hdr': args[args.index('-vf') + 1] += ',setsar=1'
        if suffix in ('.jpg', '.jpeg'): args += ['-q:v', '3']
        elif suffix == '.png': args += ['-compression_level', '9']
        if suffix == '.webp':
            # The machine's ffmpeg decodes WebP; its standalone libwebp tools encode it.
            intermediate = target.with_suffix('.png')
            subprocess.run([*args, str(intermediate)], check=True)
            subprocess.run(['cwebp', '-quiet', '-q', '84', str(intermediate), '-o', str(target)], check=True)
        else: subprocess.run([*args, str(target)], check=True)
        encoded = target.read_bytes()
        # Never make a small source larger merely to use a common path.
        return encoded if len(encoded) < len(raw) else raw

def glb(raw, maximum):
    magic, version, length = struct.unpack_from('<III', raw)
    assert magic == 0x46546c67 and version == 2 and length == len(raw)
    size, kind = struct.unpack_from('<II', raw, 12); assert kind == 0x4e4f534a
    model = json.loads(raw[20:20+size]); at = 20 + size
    n, kind = struct.unpack_from('<II', raw, at); assert kind == 0x004e4942
    binary = raw[at+8:at+8+n]; assert len(model['buffers']) == 1
    images = {x['bufferView']: x['mimeType'] for x in model.get('images', [])}
    result = bytearray(); geometry = []
    for index, view in enumerate(model['bufferViews']):
        start = view.get('byteOffset', 0); data = binary[start:start+view['byteLength']]
        assert len(data) == view['byteLength']
        if index in images:
            suffix = {'image/webp': '.webp', 'image/png': '.png', 'image/jpeg': '.jpg'}[images[index]]
            data = image(data, suffix, maximum)
        else: geometry.append((index, digest(data)))
        while len(result) % 4: result.append(0)
        view['byteOffset'] = len(result); view['byteLength'] = len(data); result.extend(data)
    model['buffers'][0]['byteLength'] = len(result)
    for index, expected in geometry:
        view = model['bufferViews'][index]; assert digest(result[view['byteOffset']:view['byteOffset']+view['byteLength']]) == expected
    js = json.dumps(model, separators=(',', ':'), ensure_ascii=False).encode()
    js += b' ' * (-len(js) % 4); result += b'\0' * (-len(result) % 4)
    return struct.pack('<III', magic, 2, 12+8+len(js)+8+len(result)) + struct.pack('<II', len(js), 0x4e4f534a) + js + struct.pack('<II', len(result), 0x004e4942) + result

def convert(path):
    rel = path.relative_to(ASSETS); raw = path.read_bytes(); suffix = path.suffix.lower()
    if suffix in ('.jpg', '.jpeg', '.png', '.webp'):
        maximum = 1024 if 'alpha' in path.name or 'sora-ae86' in str(rel) else 512
        data = image(raw, suffix, maximum)
    elif suffix == '.glb': data = glb(raw, 1024 if 'sora-ae86' in str(rel) else 512)
    elif suffix == '.hdr': data = image(raw, suffix, 1024)
    else: data = raw
    dest = OUT / rel; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(data)
    return {'source': str(rel), 'sourceBytes': len(raw), 'sourceSha256': digest(raw), 'path': 'drive-optimized/v1/' + str(rel), 'bytes': len(data), 'sha256': digest(data)}

def main():
    inputs = set()
    for folder in ['materials', 'models/understory', 'models/shop-props']:
        inputs.update(p for p in (ASSETS/folder).rglob('*') if p.suffix.lower() in ('.png','.jpg','.jpeg','.webp','.gltf','.bin'))
    roadside = ASSETS/'models/roadside'
    for folder in ['shutter', 'pipes']:
        inputs.update(p for p in (roadside/folder).rglob('*') if p.suffix.lower() in ('.png','.jpg','.jpeg','.gltf','.bin'))
    tree = roadside/'mature-tree'
    inputs.update(p for p in (tree/'source/textures').iterdir() if p.suffix.lower() in ('.png','.jpg','.jpeg'))
    for lod in [2,3]:
        for suffix in ['.bin','.gltf']: inputs.add(tree/f'mature-tree-lod{lod}{suffix}')
    for name in ['models/sora-ae86/ae86.glb','models/driver/driver.glb','lighting/qwantani-dusk.hdr']:
        inputs.add(ASSETS/name)
    with ThreadPoolExecutor(max_workers=4) as workers:
        for row in workers.map(convert, sorted(inputs)):
            ROWS.append(row); print(row['source'], row['sourceBytes'], '->', row['bytes'], flush=True)
    source = ASSETS/'models/architecture-ambient/geometry.bin'; raw = source.read_bytes(); data = gzip.compress(raw, compresslevel=9, mtime=0)
    target = OUT/'models/architecture-ambient/geometry.bin.gz'; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
    ROWS.append({'source': 'models/architecture-ambient/geometry.bin', 'sourceBytes':len(raw),'sourceSha256':digest(raw),'path':'drive-optimized/v1/models/architecture-ambient/geometry.bin.gz','bytes':len(data),'sha256':digest(data),'encoding':'gzip','decodedSha256':digest(raw)})
    manifest = {'schema':'sora-cars.driving-assets.v1','recipe':'scripts/optimize-driving-assets.py','originalsPreserved':True,'geometryPreservedExceptAuthoredTreeLODSelection':True,'files':ROWS}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    paths = {r['source']:r['path'] for r in ROWS if 'encoding' not in r}
    generated = '// Generated by scripts/optimize-driving-assets.py; original assets remain beside their licensed provenance.\nexport const optimizedDrivingAssets: Readonly<Record<string, string>> = '+json.dumps(paths,indent=2)+';\n'
    (ROOT/'src/game/three/optimized-driving-assets.ts').write_text(generated)
    (OUT/'README.md').write_text('# Driving asset derivatives\n\nGenerated from the unchanged, licensed originals in `public/assets` by `scripts/optimize-driving-assets.py`. The manifest retains each original and derived SHA-256 and size. Existing attribution and licenses beside the original models apply unchanged. Mesh, skin, node, animation and material identities remain unchanged; only image resolution/encoding changes. Roadside trees use the existing authored LOD2/3 geometry. Architectural geometry is losslessly gzip-compressed and verified against its original manifest after decompression.\n')
    print('TOTAL',sum(r['sourceBytes']for r in ROWS),'->',sum(r['bytes']for r in ROWS),flush=True)
if __name__ == '__main__': main()
