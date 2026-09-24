"""Convert a (Meshy style) single-mesh .blend into a textured .glb without Blender.
usage: python3 blend2glb.py in.blend out.glb [--tex 1024] [--mr 512] [--normal 1024]"""
import sys, io, json, struct, argparse
import numpy as np
from PIL import Image
from blendfile import BlendFile

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--tex', type=int, default=1024)
ap.add_argument('--mr', type=int, default=512)
ap.add_argument('--normal', type=int, default=1024)
ap.add_argument('--nonormal', action='store_true')
a = ap.parse_args()

bf = BlendFile(a.src)

def layer_arrays(cd_off):
    out = {}
    lp = bf.get('CustomData', cd_off, 'layers'); n = bf.get('CustomData', cd_off, 'totlayer')
    lb = bf.block_at(lp); sz = bf.struct_by_name['CustomDataLayer'].size
    for i in range(n):
        lo = lb['off'] + i * sz
        name = bf.get('CustomDataLayer', lo, 'name'); typ = bf.get('CustomDataLayer', lo, 'type')
        db = bf.block_at(bf.get('CustomDataLayer', lo, 'data'))
        if db: out[(typ, name)] = (db['off'], db['size'])
    return out

me = next(b for b in bf.blocks if b['code'] == 'ME')
mo = me['off']
nv = bf.get('Mesh', mo, 'totvert'); npoly = bf.get('Mesh', mo, 'totpoly'); nl = bf.get('Mesh', mo, 'totloop')
V = layer_arrays(bf.get('Mesh', mo, 'vdata'))
L = layer_arrays(bf.get('Mesh', mo, 'ldata'))
pos_off, _ = next(v for k, v in V.items() if k[1] == 'position')
pos = np.frombuffer(bf.data, dtype='<f4', count=nv * 3, offset=pos_off).reshape(nv, 3).copy()
cv_off, _ = next(v for k, v in L.items() if k[1] == '.corner_vert')
corner_vert = np.frombuffer(bf.data, dtype='<i4', count=nl, offset=cv_off)
uv_off, _ = next(v for k, v in L.items() if k[0] == 49 and not k[1].startswith('.'))
uv = np.frombuffer(bf.data, dtype='<f4', count=nl * 2, offset=uv_off).reshape(nl, 2)
po = bf.block_at(bf.get('Mesh', mo, 'poly_offset_indices'))
poly_off = np.frombuffer(bf.data, dtype='<i4', count=npoly + 1, offset=po['off'])
sizes = np.diff(poly_off)
print('verts', nv, 'polys', npoly, 'loops', nl, 'poly sizes', np.unique(sizes))

# triangulate (fan) -> loop index triples
tris = []
for s in np.unique(sizes):
    idx = np.nonzero(sizes == s)[0]
    starts = poly_off[idx]
    for k in range(1, s - 1):
        tris.append(np.stack([starts, starts + k, starts + k + 1], axis=1))
tri_loops = np.concatenate(tris)

# unique (vertex, uv) pairs
uvq = np.round(uv * 65535).astype(np.int64)
key = corner_vert.astype(np.int64) * (1 << 40) + uvq[:, 0] * (1 << 20) + uvq[:, 1]
ukey, first, inv = np.unique(key, return_index=True, return_inverse=True)
new_pos_src = corner_vert[first]
new_uv = uv[first].copy()
indices = inv[tri_loops].astype(np.uint32)

# Blender Z-up -> glTF Y-up
P = pos[:, [0, 2, 1]].copy(); P[:, 2] *= -1
# smooth normals per original vertex (area weighted)
tv = corner_vert[tri_loops]
a0, a1, a2 = P[tv[:, 0]], P[tv[:, 1]], P[tv[:, 2]]
fn = np.cross(a1 - a0, a2 - a0)
N = np.zeros_like(P)
for k in range(3): np.add.at(N, tv[:, k], fn)
N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
positions = P[new_pos_src].astype('<f4')
normals = N[new_pos_src].astype('<f4')
uvs = np.stack([new_uv[:, 0], 1 - new_uv[:, 1]], axis=1).astype('<f4')
print('out verts', len(positions), 'tris', len(indices))

# images (Meshy order: 0 basecolor, 1 metallic/roughness, 2 normal)
imgs = []
for b in bf.blocks:
    if b['code'] != 'IM': continue
    first_ = bf.get('ListBase', bf.get('Image', b['off'], 'packedfiles'), 'first')
    ib = bf.block_at(first_); pb = bf.block_at(bf.get('ImagePackedFile', ib['off'], 'packedfile'))
    size = bf.get('PackedFile', pb['off'], 'size'); db = bf.block_at(bf.get('PackedFile', pb['off'], 'data'))
    imgs.append(Image.open(io.BytesIO(bf.data[db['off']:db['off'] + size])).convert('RGB'))
def jpg(im, s, q=88):
    b = io.BytesIO(); im.resize((s, s), Image.LANCZOS).save(b, 'JPEG', quality=q); return b.getvalue()
def png(im, s):
    b = io.BytesIO(); im.resize((s, s), Image.LANCZOS).save(b, 'PNG', optimize=True); return b.getvalue()
tex_blobs = [('image/jpeg', jpg(imgs[0], a.tex)), ('image/jpeg', jpg(imgs[1], a.mr))]
if not a.nonormal and len(imgs) > 2: tex_blobs.append(('image/jpeg', jpg(imgs[2], a.normal, 92)))

# ---- write glb
bin_parts, views = [], []
def add_view(data, target=None):
    off = sum(len(p) for p in bin_parts)
    pad = (-off) % 4
    if pad: bin_parts.append(b'\0' * pad); off += pad
    bin_parts.append(data)
    v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target: v['target'] = target
    views.append(v); return len(views) - 1
acc = []
def add_acc(arr, typ, comp, target, minmax=False):
    vi = add_view(arr.tobytes(), target)
    d = {'bufferView': vi, 'componentType': comp, 'count': int(arr.shape[0]) if typ != 'SCALAR' else int(arr.size), 'type': typ}
    if minmax: d['min'] = arr.min(0).tolist(); d['max'] = arr.max(0).tolist()
    acc.append(d); return len(acc) - 1
ip = add_acc(positions, 'VEC3', 5126, 34962, True)
inn = add_acc(normals, 'VEC3', 5126, 34962)
iuv = add_acc(uvs, 'VEC2', 5126, 34962)
iidx = add_acc(indices.reshape(-1), 'SCALAR', 5125, 34963)
images, textures = [], []
for mime, blob in tex_blobs:
    images.append({'bufferView': add_view(blob), 'mimeType': mime})
    textures.append({'source': len(images) - 1, 'sampler': 0})
mat = {'name': 'mat', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicRoughnessTexture': {'index': 1}, 'metallicFactor': 1.0, 'roughnessFactor': 1.0}}
if len(textures) > 2: mat['normalTexture'] = {'index': 2}
gltf = {
    'asset': {'version': '2.0', 'generator': 'blend2glb.py'},
    'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': 'model'}],
    'meshes': [{'primitives': [{'attributes': {'POSITION': ip, 'NORMAL': inn, 'TEXCOORD_0': iuv}, 'indices': iidx, 'material': 0}]}],
    'materials': [mat], 'textures': textures, 'images': images,
    'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
    'accessors': acc, 'bufferViews': views, 'buffers': [{'byteLength': sum(len(p) for p in bin_parts)}],
}
binb = b''.join(bin_parts); binb += b'\0' * ((-len(binb)) % 4)
js = json.dumps(gltf, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
gltf['buffers'][0]['byteLength'] = len(binb)
js = json.dumps(gltf, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
with open(a.dst, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binb)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(binb), 0x004E4942)); f.write(binb)
print('wrote', a.dst, 'bbox', positions.min(0), positions.max(0))
