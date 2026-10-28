"""Prepare the independently adapted, logo-free CarConcept source GLB.

Run from the repository root with Python 3. No image pixels are repainted:
trademark-bearing image resources and their material references are removed.
"""
from pathlib import Path
import hashlib
import json
import struct
import urllib.request

COMMIT = '723ffc6706725b618b8c14ceb82e3e6904b08a76'
SOURCE = f'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/{COMMIT}/Models/CarConcept/glTF-Binary/CarConcept.glb'
SHA256 = 'c272098089d78c5cd9fd9f24ff50ee8acf8d932c55f2d55fc10adb6c8998966b'
original = Path('tmp/fidelity/car-concept/CarConcept.original.glb')
if not original.exists():
    original.parent.mkdir(parents=True, exist_ok=True)
    original.write_bytes(urllib.request.urlopen(SOURCE, timeout=60).read())
data = original.read_bytes()
assert hashlib.sha256(data).hexdigest() == SHA256, 'Source GLB checksum mismatch'
json_length = struct.unpack_from('<I', data, 12)[0]
gltf = json.loads(data[20:20 + json_length])
binary = data[28 + json_length:]
# Khronos_C, Tireside_C and Tireside_N contain excluded trademark artwork.
removed_images = {3, 10, 11}
removed_textures = {i for i, texture in enumerate(gltf['textures']) if texture['source'] in removed_images}

def clean_references(value):
    if isinstance(value, dict):
        for key, child in list(value.items()):
            if 'texture' in key.lower() and isinstance(child, dict) and child.get('index') in removed_textures:
                del value[key]
            else:
                clean_references(child)
    elif isinstance(value, list):
        for child in value:
            clean_references(child)

for index, material in enumerate(gltf['materials']):
    material.setdefault('name', 'Panel' if index == 2 else f'Material {index}')
    clean_references(material)
    if material.get('emissiveTexture') is None and material['name'] in {'Panel', 'Hardware', 'Mirror', 'Brake', 'Rim1', 'Rim2'}:
        material['emissiveFactor'] = [0, 0, 0]
    if material['name'] == 'Tireside':
        material['pbrMetallicRoughness']['baseColorFactor'] = [0.012, 0.014, 0.016, 1]
    if material['name'] == 'License':
        material['pbrMetallicRoughness']['baseColorFactor'] = [0.72, 0.72, 0.69, 1]

for node in gltf['nodes']:
    if node.get('name') in {'License Plate', 'InteriorSteeringEmblem'}:
        node.pop('mesh', None)
        node['name'] = 'Removed source marking'

texture_remap = {old: new for new, old in enumerate(i for i in range(len(gltf['textures'])) if i not in removed_textures)}
def remap_references(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if 'texture' in key.lower() and isinstance(child, dict) and 'index' in child:
                child['index'] = texture_remap[child['index']]
            else:
                remap_references(child)
    elif isinstance(value, list):
        for child in value:
            remap_references(child)
for material in gltf['materials']:
    remap_references(material)
gltf['textures'] = [texture for i, texture in enumerate(gltf['textures']) if i not in removed_textures]
image_remap = {old: new for new, old in enumerate(i for i in range(len(gltf['images'])) if i not in removed_images)}
for texture in gltf['textures']:
    texture['source'] = image_remap[texture['source']]
removed_views = {image['bufferView'] for i, image in enumerate(gltf['images']) if i in removed_images}
gltf['images'] = [image for i, image in enumerate(gltf['images']) if i not in removed_images]
view_remap = {}
views = []
chunks = bytearray()
for i, view in enumerate(gltf['bufferViews']):
    if i in removed_views:
        continue
    view_remap[i] = len(views)
    offset = view.get('byteOffset', 0)
    content = binary[offset:offset + view['byteLength']]
    while len(chunks) % 4:
        chunks.append(0)
    view['byteOffset'] = len(chunks)
    chunks.extend(content)
    views.append(view)
for accessor in gltf['accessors']:
    if 'bufferView' in accessor:
        accessor['bufferView'] = view_remap[accessor['bufferView']]
for image in gltf['images']:
    image['bufferView'] = view_remap[image['bufferView']]
gltf['bufferViews'] = views
gltf['buffers'][0]['byteLength'] = len(chunks)
gltf['asset']['copyright'] = 'Copyright 2024 Darmstadt Graphics Group GmbH. Model and textures by Eric Chadwick, CC BY 4.0. SORA CARS adaptation: source logos and tire markings removed; see PROVENANCE.md.'
encoded = json.dumps(gltf, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
chunks.extend(b'\0' * (-len(chunks) % 4))
output = struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(chunks))
output += struct.pack('<I4s', len(encoded), b'JSON') + encoded
output += struct.pack('<I4s', len(chunks), b'BIN\0') + chunks
path = Path('public/assets/models/sora-coupe/sora-coupe.glb')
path.write_bytes(output)
print(json.dumps({'source': SOURCE, 'sourceSHA256': SHA256, 'output': str(path), 'bytes': len(output), 'sha256': hashlib.sha256(output).hexdigest(), 'removedImages': sorted(removed_images)}, indent=2))
