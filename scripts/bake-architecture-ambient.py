"""Bake broad ambient visibility from the actual procedural architecture source.

Run with Blender's Python (CPU only):
  Blender --background --factory-startup --python-exit-code 1 --python scripts/bake-architecture-ambient.py -- \
    --input source.json --output-dir public/assets/architecture/ambient

Input schema version 1 contains source-local templates and material meshes:
  {"schemaVersion":1,"templates":[{"id":"apartment-0","meshes":[{
    "id":"0","materialKind":"plaster","opaque":true,"bake":true,
    "position":[x,y,z,...],"normal":[nx,ny,nz,...],"uv":[u,v,...],
    "index":[a,b,c,...]
  }]}]}
`index` is optional for nonindexed input. `bake` is optional and defaults to
opaque materials other than glass/emissive. All opaque source triangles occlude,
including targets with bake=false. Transparent surfaces never occlude.

The output manifest describes tightly packed, 4-byte-aligned little-endian
Float32 attributes and Uint32 indices in geometry.bin. Source normals and UVs
are interpolated exactly; ray directions alone use normalized normals. This is
geometry-dependent indirect visibility, independent of paint or direct lights.
"""
from __future__ import annotations

import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import sys
import time

from mathutils import Vector
from mathutils.bvhtree import BVHTree


def arguments():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--template', action='append', help='Bake selected template ids only.')
    parser.add_argument('--max-edge', type=float, default=0.55)
    parser.add_argument('--thin-max-edge', type=float, default=1.1, help='Long edge limit for triangles below 0.06 m^2 with altitude below 0.08 m.')
    parser.add_argument('--samples', type=int, default=128)
    parser.add_argument('--distance', type=float, default=4.0)
    parser.add_argument('--offset', type=float, default=0.005)
    args = parser.parse_args(argv)
    if args.max_edge <= 0 or args.thin_max_edge < args.max_edge or args.samples < 1 or args.distance <= 0 or args.offset <= 0:
        parser.error('max-edge, samples, distance and offset must be positive; thin-max-edge must be at least max-edge')
    return args


def require(condition, message):
    if not condition:
        raise ValueError(message)


def triangles(mesh):
    count = len(mesh['position']) // 3
    indices = mesh.get('index')
    if indices is None:
        require(count % 3 == 0, f"{mesh['id']}: nonindexed vertex count is not a triangle list")
        indices = range(count)
    require(len(indices) % 3 == 0, f"{mesh['id']}: index count is not a triangle list")
    require(all(isinstance(i, int) and 0 <= i < count for i in indices), f"{mesh['id']}: invalid index")
    return [tuple(indices[i:i + 3]) for i in range(0, len(indices), 3)]


def validate_mesh(mesh):
    for name in ('id', 'materialKind', 'opaque', 'position', 'normal', 'uv'):
        require(name in mesh, f'Missing mesh field {name}')
    count = len(mesh['position']) // 3
    require(len(mesh['position']) == count * 3 and len(mesh['normal']) == count * 3
            and len(mesh['uv']) == count * 2, f"{mesh['id']}: mismatched attribute lengths")
    require(isinstance(mesh['opaque'], bool), f"{mesh['id']}: opaque must be boolean")
    require('bake' not in mesh or isinstance(mesh['bake'], bool), f"{mesh['id']}: bake must be boolean")
    require(all(math.isfinite(x) for key in ('position', 'normal', 'uv') for x in mesh[key]),
            f"{mesh['id']}: nonfinite source attribute")
    faces = triangles(mesh)
    should_bake = mesh.get('bake', mesh['opaque'] and mesh['materialKind'].lower() not in ('glass', 'emissive'))
    if should_bake and mesh.get('sourceHash'):
        digest = hashlib.sha256()
        for key in ('position', 'normal', 'uv', 'index'):
            values = mesh.get(key) if key != 'index' else mesh.get('index', range(count))
            packed = array('I' if key == 'index' else 'f', values)
            if sys.byteorder != 'little':
                packed.byteswap()
            digest.update(packed.tobytes())
        require(digest.hexdigest() == mesh['sourceHash'], f"{mesh['id']}: sourceHash does not match exported Float32 attributes and Uint32 indices")
    return faces


def source_bvh(meshes, mesh_triangles):
    vertices, faces = [], []
    for mesh, source_faces in zip(meshes, mesh_triangles):
        if not mesh['opaque']:
            continue
        base = len(vertices)
        positions = mesh['position']
        vertices.extend(tuple(positions[i:i + 3]) for i in range(0, len(positions), 3))
        faces.extend(tuple(base + i for i in face) for face in source_faces)
    require(bool(faces), 'A template must contain opaque source triangles')
    return BVHTree.FromPolygons(vertices, faces, all_triangles=True, epsilon=0.0), len(faces)


def index_and_subdivide(mesh, source_faces, max_edge, thin_max_edge, subdivide):
    """Longest-edge bisection preserves each source triangle's exact surface.

    Deduplication includes position, normal and UV so material seams and hard
    edges survive. Shared midpoints prevent repeated work across indexed faces.
    Small fittings whose longest edge already meets the limit are untouched.
    """
    vertices, remap, by_value = [], [], {}
    positions, normals, uvs = mesh['position'], mesh['normal'], mesh['uv']
    for i in range(len(positions) // 3):
        value = tuple(positions[i * 3:i * 3 + 3] + normals[i * 3:i * 3 + 3] + uvs[i * 2:i * 2 + 2])
        index = by_value.get(value)
        if index is None:
            index = len(vertices)
            by_value[value] = index
            vertices.append(value)
        remap.append(index)
    original_unique = len(vertices)
    edges = {}
    output_faces = []
    limit = max_edge * max_edge * (1 + 1e-12)
    thin_limit = thin_max_edge * thin_max_edge * (1 + 1e-12)

    def midpoint(a, b):
        edge = (a, b) if a < b else (b, a)
        result = edges.get(edge)
        if result is None:
            value = tuple((x + y) * 0.5 for x, y in zip(vertices[a], vertices[b]))
            result = by_value.get(value)
            if result is None:
                result = len(vertices)
                vertices.append(value)
                by_value[value] = result
            edges[edge] = result
        return result

    for source_face in source_faces:
        stack = [tuple(remap[i] for i in source_face)]
        while stack:
            a, b, c = stack.pop()
            if not subdivide:
                output_faces.append((a, b, c))
                continue
            pairs = ((a, b, c), (b, c, a), (c, a, b))
            distances = [sum((vertices[x][i] - vertices[y][i]) ** 2 for i in range(3)) for x, y, _ in pairs]
            longest = max(range(3), key=distances.__getitem__)
            selected_limit = limit
            if distances[longest] > limit and thin_limit > limit:
                ab = Vector(vertices[b][:3]) - Vector(vertices[a][:3])
                ac = Vector(vertices[c][:3]) - Vector(vertices[a][:3])
                twice_area = ab.cross(ac).length
                altitude = twice_area / math.sqrt(distances[longest])
                # Thin sill noses, metal strips and drip grooves have no broad
                # surface requiring a square 0.55 m sampling grid. Keep those
                # narrow triangles at useful longitudinal density instead.
                if twice_area < 0.12 and altitude < 0.08:
                    selected_limit = thin_limit
            if distances[longest] <= selected_limit:
                output_faces.append((a, b, c))
                continue
            x, y, z = pairs[longest]
            m = midpoint(x, y)
            stack.append((m, y, z))
            stack.append((x, m, z))
    return vertices, output_faces, original_unique


def hemisphere(samples):
    # Deterministic equal-area disk sequence lifted into a cosine hemisphere.
    golden_angle = math.pi * (3 - math.sqrt(5))
    return [(math.sqrt((i + 0.5) / samples) * math.cos(i * golden_angle),
             math.sqrt((i + 0.5) / samples) * math.sin(i * golden_angle),
             math.sqrt(1 - (i + 0.5) / samples)) for i in range(samples)]


def visibility(vertices, bvh, directions, max_distance, offset, cache, should_bake):
    if not should_bake:
        return [1.0] * len(vertices), 0
    values, rays = [], 0
    for value in vertices:
        key = value[:6]
        result = cache.get(key)
        if result is None:
            normal = Vector(value[3:6])
            if normal.length_squared < 1e-16:
                result = 1.0
            else:
                normal.normalize()
                tangent = normal.cross(Vector((0, 1, 0) if abs(normal.y) < 0.9 else (1, 0, 0))).normalized()
                bitangent = normal.cross(tangent)
                origin = Vector(value[:3]) + normal * offset
                visible_weight = 0.0
                for x, y, z in directions:
                    direction = tangent * x + bitangent * y + normal * z
                    location, _, _, distance = bvh.ray_cast(origin, direction, max_distance)
                    # Occlusion fades continuously to zero at the bake radius.
                    visible_weight += 1.0 if location is None else min(1.0, (distance / max_distance) ** 2)
                rays += len(directions)
                result = visible_weight / len(directions)
            cache[key] = result
        values.append(result)
    return values, rays


def bounds(vertices):
    if not vertices:
        return None
    return {'min': [min(v[i] for v in vertices) for i in range(3)],
            'max': [max(v[i] for v in vertices) for i in range(3)]}


def surface_area(vertices, faces):
    total = 0.0
    for a, b, c in faces:
        total += (Vector(vertices[b][:3]) - Vector(vertices[a][:3])).cross(
            Vector(vertices[c][:3]) - Vector(vertices[a][:3])).length * 0.5
    return total


def main():
    args = arguments()
    start = time.perf_counter()
    source_bytes = args.input.read_bytes()
    source = json.loads(source_bytes)
    require(source.get('schemaVersion') == 1, 'Unsupported input schema version')
    templates = source.get('templates', [])
    require(len({t['id'] for t in templates}) == len(templates), 'Duplicate template ids')
    if args.template:
        require(set(args.template) <= {t['id'] for t in templates}, 'Unknown requested template id')
        templates = [t for t in templates if t['id'] in args.template]
    require(bool(templates), 'Input has no selected templates')
    args.output_dir.mkdir(parents=True, exist_ok=True)
    binary = bytearray()
    manifest = {
        'schemaVersion': 1,
        'inputSha256': hashlib.sha256(source_bytes).hexdigest(),
        'binary': 'geometry.bin',
        'endianness': 'little',
        'settings': {'maxEdgeMeters': args.max_edge, 'thinMaxEdgeMeters': args.thin_max_edge,
                     'thinTriangleCriterion': 'area < 0.06 m^2 and shortest altitude < 0.08 m',
                     'hemisphereSamples': args.samples,
                     'maxDistanceMeters': args.distance, 'normalOffsetMeters': args.offset,
                     'sampling': 'cosine-golden-angle-v1', 'sourceOccluders': 'opaque-only',
                     'occlusionFalloff': 'max(0, 1 - (hitDistance / maxDistanceMeters)^2)'
},
        'templates': [],
    }

    def append(values, item_size, kind='float32'):
        packed = array('f' if kind == 'float32' else 'I', values)
        require(packed.itemsize == 4, 'Expected four-byte float/index storage')
        if sys.byteorder != 'little':
            packed.byteswap()
        spec = {'byteOffset': len(binary), 'count': len(packed) // item_size, 'itemSize': item_size, 'type': kind}
        binary.extend(packed.tobytes())
        return spec

    for template in templates:
        template_start = time.perf_counter()
        meshes = template['meshes']
        require(len({m['id'] for m in meshes}) == len(meshes), f"{template['id']}: duplicate mesh ids")
        source_faces = [validate_mesh(mesh) for mesh in meshes]
        bvh, occluder_triangles = source_bvh(meshes, source_faces)
        directions, cache = hemisphere(args.samples), {}
        output_template = {'id': template['id'], 'sourceTriangleCount': sum(map(len, source_faces)),
                           'occluderTriangleCount': occluder_triangles, 'meshes': []}
        for mesh, faces in zip(meshes, source_faces):
            mesh_start = time.perf_counter()
            should_bake = mesh.get('bake', mesh['opaque'] and mesh['materialKind'].lower() not in ('glass', 'emissive'))
            vertices, output_faces, original_unique = index_and_subdivide(mesh, faces, args.max_edge, args.thin_max_edge, should_bake)
            values, rays = visibility(vertices, bvh, directions, args.distance, args.offset, cache, should_bake)
            original_positions = [tuple(mesh['position'][i:i + 3]) for i in range(0, len(mesh['position']), 3)]
            original_area, new_area = surface_area(original_positions, faces), surface_area(vertices, output_faces)
            require(abs(original_area - new_area) <= max(1e-5, original_area * 2e-6), f"{template['id']}/{mesh['id']}: subdivision changed surface area")
            require(bounds(original_positions) == bounds(vertices), f"{template['id']}/{mesh['id']}: subdivision changed bounds")
            output_mesh = {'id': mesh['id'], 'materialKind': mesh['materialKind'], 'opaque': mesh['opaque'], 'baked': should_bake,
                           'vertexCount': len(vertices), 'triangleCount': len(output_faces), 'sourceVertexCount': len(original_positions),
                           'sourceUniqueVertexCount': original_unique, 'sourceTriangleCount': len(faces),
                           'sourceHash': mesh.get('sourceHash'), 'bounds': bounds(vertices),
                           'sourceSurfaceArea': original_area, 'outputSurfaceArea': new_area,
                           'attributes': {'position': append((c for v in vertices for c in v[:3]), 3),
                                          'normal': append((c for v in vertices for c in v[3:6]), 3),
                                          'uv': append((c for v in vertices for c in v[6:8]), 2),
                                          'visibility': append(values, 1)},
                           'index': append((i for face in output_faces for i in face), 1, 'uint32'),
                           'visibilityRange': [min(values, default=1.0), max(values, default=1.0)],
                           'meanVisibility': sum(values) / len(values) if values else 1.0,
                           'rays': rays, 'seconds': round(time.perf_counter() - mesh_start, 3)}
            output_template['meshes'].append(output_mesh)
            print(json.dumps({'template': template['id'], 'mesh': mesh['id'], 'vertices': len(vertices),
                              'triangles': len(output_faces), 'rays': rays, 'seconds': output_mesh['seconds']}), flush=True)
        output_template['seconds'] = round(time.perf_counter() - template_start, 3)
        manifest['templates'].append(output_template)
    manifest['binaryByteLength'] = len(binary)
    manifest['binarySha256'] = hashlib.sha256(binary).hexdigest()
    manifest['seconds'] = round(time.perf_counter() - start, 3)
    # Publish the manifest only after its complete corresponding binary exists.
    (args.output_dir / 'geometry.bin').write_bytes(binary)
    (args.output_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'complete': True, 'seconds': manifest['seconds'], 'bytes': len(binary),
                      'manifest': str(args.output_dir / 'manifest.json')}), flush=True)


if __name__ == '__main__':
    main()
