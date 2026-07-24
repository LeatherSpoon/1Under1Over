# Cavity ink v3 — no Cycles. Ink signal = distance from body surface to the
# smooth containing envelope (TreeH2_OutlineHull): large where the envelope
# bridges a recess (tier creases, blob seams), baseline over bump tops.
# Smooth and tier-scale by construction. Rasterized to the UV map directly.
import bpy, bmesh, mathutils
import numpy as np
from mathutils.bvhtree import BVHTree

body = bpy.data.objects['TreeH2']
hull = bpy.data.objects['TreeH2_OutlineHull']
mat = body.data.materials[0]

def base_image_node(m):
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    stack = [l.from_node for l in bsdf.inputs['Base Color'].links]
    seen = set()
    while stack:
        n = stack.pop()
        if n in seen:
            continue
        seen.add(n)
        if n.type == 'TEX_IMAGE':
            return n
        for i2 in n.inputs:
            stack.extend(l.from_node for l in i2.links)
    return None

base_node = base_image_node(mat)
stash = mat.get('ink_src_image')
base_img = bpy.data.images.get(stash) if stash else None
if base_img is None or base_img.name.startswith('TreeH2_diffuse_inked'):
    cand = base_node.image
    if cand is None or cand.name.startswith('TreeH2_diffuse_inked'):
        cand = bpy.data.images.get('texture_diffuse.012')
    base_img = cand
mat['ink_src_image'] = base_img.name
W, H = base_img.size

hbm = bmesh.new()
hbm.from_mesh(hull.data)
bvh = BVHTree.FromBMesh(hbm)

me = body.data
nv = len(me.vertices)
vco = np.empty(nv * 3, dtype=np.float32)
me.vertices.foreach_get('co', vco)
vco = vco.reshape(-1, 3)
vdepth = np.empty(nv, dtype=np.float32)
for i in range(nv):
    loc, nrm, idx, dist = bvh.find_nearest(mathutils.Vector(vco[i]))
    vdepth[i] = dist if loc is not None else 0.0
hbm.free()

me.calc_loop_triangles()
uvd = me.uv_layers.active.data
depth_img = np.zeros((H, W), dtype=np.float32)
for tri in me.loop_triangles:
    dv = vdepth[list(tri.vertices)]
    if dv.max() < 0.02:
        continue
    uvs = np.array([uvd[l].uv[:] for l in tri.loops], dtype=np.float64)
    uvs[:, 0] *= W
    uvs[:, 1] *= H
    x0 = max(int(np.floor(uvs[:, 0].min())), 0)
    x1 = min(int(np.ceil(uvs[:, 0].max())) + 1, W)
    y0 = max(int(np.floor(uvs[:, 1].min())), 0)
    y1 = min(int(np.ceil(uvs[:, 1].max())) + 1, H)
    if x1 <= x0 or y1 <= y0:
        continue
    gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
    a, b, c = uvs
    det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(det) < 1e-9:
        continue
    w0 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / det
    w1 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / det
    w2 = 1.0 - w0 - w1
    inside = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
    if not inside.any():
        continue
    val = w0 * dv[0] + w1 * dv[1] + w2 * dv[2]
    region = depth_img[y0:y1, x0:x1]
    np.maximum(region, np.where(inside, val, 0.0), out=region)

for _ in range(2):
    acc = depth_img.copy()
    for shift in (-2, -1, 1, 2):
        acc += np.roll(depth_img, shift, axis=0)
        acc += np.roll(depth_img, shift, axis=1)
    depth_img = acc / 9.0

pos = vdepth[vdepth > 0.01]
p55, p75, p90 = (float(np.percentile(pos, q)) for q in (55, 75, 90))
d = depth_img.reshape(-1)
line = np.clip((d - p75) / max(p90 - p75, 0.01), 0.0, 1.0)
shade = np.clip((d - p55) / max(p75 - p55, 0.01), 0.0, 1.0)
mult = (1.0 - 0.88 * line) * (1.0 - 0.45 * shade) + 0.0
mult = np.maximum(mult, 0.10)

old_inked = bpy.data.images.get('TreeH2_diffuse_inked')
if old_inked and old_inked is not base_img:
    bpy.data.images.remove(old_inked)
inked = base_img.copy()
inked.name = 'TreeH2_diffuse_inked'
px = np.empty(W * H * 4, dtype=np.float32)
inked.pixels.foreach_get(px)
px = px.reshape(-1, 4)
px[:, 0] *= mult
px[:, 1] *= mult
px[:, 2] *= mult
inked.pixels.foreach_set(px.reshape(-1))
inked.pack()
base_node.image = inked

SP = 'C:/Users/Owner/AppData/Local/Temp/claude/D--1Under1OverToo/b8790e3c-5bc5-4e1d-a311-7fb228f2c69a/scratchpad/'
inked.filepath_raw = SP + 'dbg_inked.png'
inked.file_format = 'PNG'
inked.save()
inkfrac = float((mult < 0.95).mean())
print(f'depth-ink {W}x{H}: ink {inkfrac:.1%}, depth p55={p55:.3f} p75={p75:.3f} p90={p90:.3f}')
