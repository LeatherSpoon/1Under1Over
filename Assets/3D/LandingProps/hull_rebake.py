# Hull rebake v6 — expects globals TREE (object name) and FNAME (glb filename).
# A shell held strictly OUTSIDE a surface whose concave detail is finer than
# the offset must cross bumps somewhere (black flecks on the body). So build a
# hull that errs INWARD instead: smooth the copy hard into a low-frequency
# cage, then re-inflate along its normals by a graph-blurred (OFFSET - d)
# field so it rides ~OFFSET above the mean surface. Bump peaks poke through
# the black shell — culled/invisible mid-body, tiny sketchy notches at the
# rim — while faces can no longer slash across bumps.
import bpy, bmesh, math, mathutils, os
from mathutils.bvhtree import BVHTree

OUT = 'D:/1Under1OverToo/models/'
# (offset, overshoot) per tree: fat mock-style ink suits single-mass crowns
# (H broadleaf, D oak); multi-lobed trees (I blobs, J tiers) drown in it
PER_TREE = {
    'TreeH':   (0.042, 0.012),
    'OakTree': (0.038, 0.010),
    'TreeI':   (0.030, 0.008),
    'TreeJ':   (0.028, 0.008),
}
OFFSET, OVERSHOOT = PER_TREE.get(TREE, (0.036, 0.010))
SMOOTH_ROUNDS = 20
BLUR_ROUNDS = 7
obj = bpy.data.objects[TREE]
obj.rotation_mode = 'XYZ'

for slot in obj.material_slots:
    m = slot.material
    if m and m.use_nodes:
        for nd in m.node_tree.nodes:
            if nd.type == 'BSDF_PRINCIPLED':
                nd.inputs['Roughness'].default_value = 1.0
                nd.inputs['Metallic'].default_value = 0.0

name = obj.name + '_OutlineHull'
old = bpy.data.objects.get(name)
if old:
    m = old.data
    bpy.data.objects.remove(old, do_unlink=True)
    if m and m.users == 0:
        bpy.data.meshes.remove(m)

dup = obj.copy()
dup.data = obj.data.copy()
bpy.context.scene.collection.objects.link(dup)
dup.name = name
black = bpy.data.materials.get('OutlineBlack')

src = bmesh.new()
src.from_mesh(obj.data)
bvh = BVHTree.FromBMesh(src)

bm = bmesh.new()
bm.from_mesh(dup.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002)
faces_before = len(bm.faces)

# drop floating micro-components — a cage around a 10-vert debris shard
# renders as a floating black dot
visited = set()
drop = []
ndrop = 0
for v in bm.verts:
    if v in visited:
        continue
    stack = [v]
    comp = []
    seen = set()
    while stack:
        u = stack.pop()
        if u in seen:
            continue
        seen.add(u)
        comp.append(u)
        for e in u.link_edges:
            w = e.other_vert(u)
            if w not in seen:
                stack.append(w)
    visited |= seen
    if len(comp) < 300:
        drop.extend(comp)
        ndrop += 1
if drop:
    bmesh.ops.delete(bm, geom=drop, context='VERTS')

for _ in range(SMOOTH_ROUNDS):
    bmesh.ops.smooth_vert(bm, verts=bm.verts[:], factor=0.5,
                          use_axis_x=True, use_axis_y=True, use_axis_z=True)
bm.normal_update()

# per-vert signed distance to the true surface (negative = inside)
delta = {}
for v in bm.verts:
    loc, nrm, idx, dist = bvh.find_nearest(v.co)
    d = (v.co - loc).dot(nrm) if loc is not None else 0.0
    delta[v] = OFFSET - d

# max-propagate the correction field (dilation cone, linear falloff): sharp
# apex bumps keep their full clearance instead of being averaged away — the
# crown band stays whole. Two mean rounds after soften the cone creases.
FALL = 0.012
for _ in range(7):
    nd_ = {}
    for v in bm.verts:
        m = delta[v]
        for e in v.link_edges:
            m = max(m, delta[e.other_vert(v)] - FALL)
        nd_[v] = m
    delta = nd_
for _ in range(2):
    nd_ = {}
    for v in bm.verts:
        acc = delta[v]
        cnt = 1
        for e in v.link_edges:
            acc += delta[e.other_vert(v)]
            cnt += 1
        nd_[v] = acc / cnt
    delta = nd_

for v in bm.verts:
    v.co += v.normal * (delta[v] + OVERSHOOT)

# delete faces that cut into the body. Strict in the top region (the crown
# must show zero black); tolerant below — a sub-6mm sliver renders under a
# pixel, and keeping those faces keeps the ink band continuous.
bm.normal_update()
zs = [v.co.z for v in bm.verts]
z_top = min(zs) + 0.72 * (max(zs) - min(zs))

def face_min_d(f):
    pts = [v.co for v in f.verts]
    samples = pts + [(a + b) * 0.5 for a, b in zip(pts, pts[1:] + pts[:1])]
    samples.append(f.calc_center_median())
    md = 1e9
    for p in samples:
        loc, nrm, idx, dist = bvh.find_nearest(p)
        if loc is not None:
            md = min(md, (p - loc).dot(nrm))
    return md

crossers = []
for f in bm.faces:
    thr = 0.0015 if f.calc_center_median().z > z_top else -0.006
    if face_min_d(f) < thr:
        crossers.append(f)
ncross = len(crossers)
if crossers:
    bmesh.ops.delete(bm, geom=crossers, context='FACES')
bm.normal_update()

# aesthetic cut, computed as a mask then majority-smoothed so the ink band
# keeps a clean edge instead of ragged bites: buried faces (little hemisphere
# visibility over the body) are lower-tier ink peeking through crevices — the
# crown top must stay clean. (No up-facing cut: strictly-outside top panels
# are self-culled, and cutting them tears the crown's far-side ink band.)
_dirs = [(0.0, 0.0, 1.0)]
for ang, count in ((45.0, 6), (75.0, 6)):
    sa = math.sin(math.radians(ang))
    ca = math.cos(math.radians(ang))
    for k in range(count):
        az = 2.0 * math.pi * k / count
        _dirs.append((sa * math.cos(az), sa * math.sin(az), ca))

def open_fraction(f):
    n = f.normal
    c = f.calc_center_median() + n * 0.012
    t = n.cross(mathutils.Vector((0.0, 0.0, 1.0)))
    if t.length < 1e-4:
        t = n.cross(mathutils.Vector((1.0, 0.0, 0.0)))
    t.normalize()
    b = n.cross(t)
    open_ = 0
    for (u, v, w) in _dirs:
        d = t * u + b * v + n * w
        if bvh.ray_cast(c, d, 2.5)[0] is None:
            open_ += 1
    return open_ / len(_dirs)

ncut = 0
nburied = 0
mask = {}
for f in bm.faces:
    thr = 0.30 if f.calc_center_median().z > z_top else 0.18
    bur = open_fraction(f) < thr
    nburied += bur
    mask[f] = bur

for _ in range(2):
    nm = {}
    for f in bm.faces:
        nb = [g for e in f.edges for g in e.link_faces if g is not f]
        if not nb:
            nm[f] = mask[f]
            continue
        frac = sum(1 for g in nb if mask[g]) / len(nb)
        if mask[f] and frac < 0.34:
            nm[f] = False
        elif not mask[f] and frac > 0.66:
            nm[f] = True
        else:
            nm[f] = mask[f]
    mask = nm

doomed = [f for f in bm.faces if mask[f]]
if doomed:
    bmesh.ops.delete(bm, geom=doomed, context='FACES')

# cull tiny leftover hull islands — isolated black ticks
visited_f = set()
tick = []
for f in bm.faces:
    if f in visited_f:
        continue
    stack = [f]
    comp = []
    seen = set()
    while stack:
        g = stack.pop()
        if g in seen:
            continue
        seen.add(g)
        comp.append(g)
        for e in g.edges:
            for h in e.link_faces:
                if h is not g and h not in seen:
                    stack.append(h)
    visited_f |= seen
    if len(comp) < 30:
        tick.extend(comp)
nticks = len(tick)
if tick:
    bmesh.ops.delete(bm, geom=tick, context='FACES')

loose = [v for v in bm.verts if not v.link_faces]
if loose:
    bmesh.ops.delete(bm, geom=loose, context='VERTS')

for f in bm.faces:
    f.normal_flip()
bm.to_mesh(dup.data)
bm.free()
src.free()
mesh = dup.data

mesh.materials.clear()
mesh.materials.append(black)
dup.parent = obj
dup.location = (0, 0, 0)
dup.rotation_mode = 'XYZ'
dup.rotation_euler = (0, 0, 0)
dup.scale = (1, 1, 1)

orig_loc = tuple(obj.location)
obj.location = (0, 0, 0)
bpy.context.view_layer.update()
bb = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
obj.location = (-(max(v.x for v in bb) + min(v.x for v in bb)) / 2,
                -(max(v.y for v in bb) + min(v.y for v in bb)) / 2,
                -min(v.z for v in bb))
bpy.context.view_layer.update()
for o in bpy.data.objects:
    o.select_set(o == obj or o == dup)
bpy.context.view_layer.objects.active = obj
path = OUT + FNAME
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True)
obj.location = orig_loc
print(f'{TREE}: hull {faces_before}->{len(mesh.polygons)} faces (smooth-cage), dropped {ndrop} micro-comps, cut {ncut} up-faces, {ncross} crossers, {nburied} buried, {nticks} ticks, {os.path.getsize(path) // 1024}KB')
