# TreeH2 hull — TIGHT containing envelope. Same artifact-free construction
# as TreeH's envelope, plus a tightening pass that pulls the shell down into
# major recesses (tier creases, blob seams) so they draw continuous geometric
# ink lines. Micro-crevices narrower than ~2x clearance stay bridged.
import bpy, bmesh, math, mathutils, os
from mathutils.bvhtree import BVHTree

OUT = 'D:/1Under1OverToo/models/'
TARGET = 0.05      # initial clearance (outer ink weight)
FLOOR = 0.028      # verified minimum clearance
TIGHT_MAX = 0.07   # pull envelope down wherever clearance exceeds this
VOXEL = 0.08
body = bpy.data.objects['TreeH2']
body.rotation_mode = 'XYZ'

old = bpy.data.objects.get('TreeH2_OutlineHull')
if old:
    m = old.data
    bpy.data.objects.remove(old, do_unlink=True)
    if m and m.users == 0:
        bpy.data.meshes.remove(m)

black = bpy.data.materials.get('OutlineBlack')

src_bm = bmesh.new()
src_bm.from_mesh(body.data)
bmesh.ops.remove_doubles(src_bm, verts=src_bm.verts, dist=0.002)
visited = set()
drop = []
for v in src_bm.verts:
    if v in visited:
        continue
    stack = [v]
    seen = set()
    while stack:
        u = stack.pop()
        if u in seen:
            continue
        seen.add(u)
        for e in u.link_edges:
            w = e.other_vert(u)
            if w not in seen:
                stack.append(w)
    visited |= seen
    if len(seen) < 300:
        drop.extend(seen)
if drop:
    bmesh.ops.delete(src_bm, geom=drop, context='VERTS')
bvh = BVHTree.FromBMesh(src_bm)

dup = body.copy()
clean_mesh = bpy.data.meshes.new('TreeH2_env_src')
src_bm.to_mesh(clean_mesh)
dup.data = clean_mesh
dup.name = 'TreeH2_OutlineHull'
bpy.context.scene.collection.objects.link(dup)

rm = dup.modifiers.new('rm', 'REMESH')
rm.mode = 'VOXEL'
rm.voxel_size = VOXEL
deps = bpy.context.evaluated_depsgraph_get()
ev = dup.evaluated_get(deps)
envmesh = bpy.data.meshes.new_from_object(ev)
dup.modifiers.clear()
oldm = dup.data
dup.data = envmesh
bpy.data.meshes.remove(oldm)
envmesh.name = 'TreeH2_OutlineHull'

bm = bmesh.new()
bm.from_mesh(envmesh)
visited = set()
comps = []
for v in bm.verts:
    if v in visited:
        continue
    stack = [v]
    seen = set()
    while stack:
        u = stack.pop()
        if u in seen:
            continue
        seen.add(u)
        for e in u.link_edges:
            w = e.other_vert(u)
            if w not in seen:
                stack.append(w)
    visited |= seen
    comps.append(seen)
comps.sort(key=len, reverse=True)
inner = [v for c in comps[1:] for v in c]
if inner:
    bmesh.ops.delete(bm, geom=inner, context='VERTS')

for _ in range(8):
    bmesh.ops.smooth_vert(bm, verts=bm.verts[:], factor=0.5,
                          use_axis_x=True, use_axis_y=True, use_axis_z=True)
bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(4.0),
                         verts=bm.verts[:], edges=bm.edges[:])
bmesh.ops.triangulate(bm, faces=bm.faces[:])
bm.normal_update()

AXES = [mathutils.Vector(a) for a in
        ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))]

def clearance(p):
    loc, nrm, idx, dist = bvh.find_nearest(p)
    if loc is None:
        return TARGET
    u = (p - loc).length
    for d in AXES:
        if bvh.ray_cast(p, d, 3.0)[0] is None:
            return u
    return -u

LIFT_CAP = 0.09
total_lift = {v: 0.0 for v in bm.verts}

def lift_round():
    need = {}
    for v in bm.verts:
        need[v] = max(0.0, TARGET - clearance(v.co))
    for _ in range(2):
        nd = {}
        for v in bm.verts:
            m_ = need[v]
            for e in v.link_edges:
                m_ = max(m_, need[e.other_vert(v)] - 0.015)
            nd[v] = m_
        need = nd
    moved = 0
    for v in bm.verts:
        allowed = min(need[v], LIFT_CAP - total_lift[v])
        if allowed > 0.0005:
            v.co += v.normal * allowed
            total_lift[v] += allowed
            moved += 1
    bm.normal_update()
    return moved

lifts = [lift_round() for _ in range(3)]

# tighten: pull the shell down into broad recesses so creases draw ink lines.
# Pull field is mean-blurred (low-frequency only), applied along the
# envelope's own normals, capped per round; floor is re-verified after.
def tighten_round():
    pull = {}
    for v in bm.verts:
        c = clearance(v.co)
        pull[v] = max(0.0, c - TIGHT_MAX) if c > 0 else 0.0
    for _ in range(2):
        np_ = {}
        for v in bm.verts:
            acc = pull[v]
            cnt = 1
            for e in v.link_edges:
                acc += pull[e.other_vert(v)]
                cnt += 1
            np_[v] = acc / cnt
        pull = np_
    moved = 0
    for v in bm.verts:
        amt = min(pull[v], 0.09)
        if amt > 0.002:
            v.co -= v.normal * amt
            moved += 1
    bm.normal_update()
    return moved

# tighten pass abandoned: blur dilutes localized pulls to nothing, and the
# broadleaf's creases are too shallow for spruce-style geometric arcs —
# the texture ink carries the interior lines. Hull = the praised envelope.
tights = []
fixes = []

def min_clearance():
    md = 1e9
    for v in bm.verts:
        md = min(md, clearance(v.co))
    for e in bm.edges:
        md = min(md, clearance((e.verts[0].co + e.verts[1].co) * 0.5))
    for f in bm.faces:
        md = min(md, clearance(f.calc_center_median()))
    return md

mc = min_clearance()
nlow = sum(1 for v in bm.verts if clearance(v.co) < FLOOR)

for f in bm.faces:
    f.normal_flip()
bm.to_mesh(envmesh)
bm.free()
src_bm.free()

envmesh.materials.clear()
envmesh.materials.append(black)
dup.parent = body
dup.location = (0, 0, 0)
dup.rotation_mode = 'XYZ'
dup.rotation_euler = (0, 0, 0)
dup.scale = (1, 1, 1)

orig_loc = tuple(body.location)
body.location = (0, 0, 0)
bpy.context.view_layer.update()
bb = [body.matrix_world @ mathutils.Vector(c) for c in body.bound_box]
body.location = (-(max(v.x for v in bb) + min(v.x for v in bb)) / 2,
                 -(max(v.y for v in bb) + min(v.y for v in bb)) / 2,
                 -min(v.z for v in bb))
bpy.context.view_layer.update()
for o in bpy.data.objects:
    o.select_set(o == body or o == dup)
bpy.context.view_layer.objects.active = body
path = OUT + 'Ghibli_Tree_H2.glb'
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True)
body.location = orig_loc
print(f'tight envelope: {len(envmesh.vertices)}v/{len(envmesh.polygons)}t, lifts {lifts}, tights {tights}, fixes {fixes}, min clr {mc:.4f}, {nlow} low, {os.path.getsize(path) // 1024}KB')
