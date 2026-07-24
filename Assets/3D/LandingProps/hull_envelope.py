# TreeH hull v11 — smooth strictly-containing envelope.
# Ink may only appear attached to a perceived edge, from ANY angle. A smooth
# closed envelope that contains the body with clearance > chord error can
# never cross it, so interior artifacts are impossible; concavities are
# bridged in open air (near side culled, far side occluded by the body).
# No face deletions at all — the outline band is continuous by construction.
import bpy, bmesh, math, mathutils, os
from mathutils.bvhtree import BVHTree

OUT = 'D:/1Under1OverToo/models/'
TARGET = 0.05        # clearance = ink boldness
FLOOR = 0.028        # verified minimum clearance
VOXEL = 0.08
obj = bpy.data.objects['TreeH']
obj.rotation_mode = 'XYZ'

# archive the v10 hull once, never delete it; later reruns replace only the
# v11 envelope
old = bpy.data.objects.get('TreeH_OutlineHull')
arch = bpy.data.objects.get('TreeH_OutlineHull_v10_archived')
if old and not arch:
    old.name = 'TreeH_OutlineHull_v10_archived'
    old.hide_render = True
    old.hide_set(True)
elif old:
    m = old.data
    bpy.data.objects.remove(old, do_unlink=True)
    if m and m.users == 0:
        bpy.data.meshes.remove(m)

black = bpy.data.materials.get('OutlineBlack')

# body copy with debris removed (a remeshed shard would become a black ball);
# the body object itself is never modified
src_bm = bmesh.new()
src_bm.from_mesh(obj.data)
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

dup = obj.copy()
clean_mesh = bpy.data.meshes.new('TreeH_env_src')
src_bm.to_mesh(clean_mesh)
dup.data = clean_mesh
dup.name = 'TreeH_OutlineHull'
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
envmesh.name = 'TreeH_OutlineHull'

bm = bmesh.new()
bm.from_mesh(envmesh)

# voxel remesh of surface-soup can emit interior shells — keep only the
# largest component (the outer envelope)
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
ncomps = len(comps)
if inner:
    bmesh.ops.delete(bm, geom=inner, context='VERTS')

for _ in range(8):
    bmesh.ops.smooth_vert(bm, verts=bm.verts[:], factor=0.5,
                          use_axis_x=True, use_axis_y=True, use_axis_z=True)
bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(4.0),
                         verts=bm.verts[:], edges=bm.edges[:])
bmesh.ops.triangulate(bm, faces=bm.faces[:])
bm.normal_update()

# winding-independent clearance: Rodin soup has flipped-normal patches, so
# (p-loc)·nrm lies. Unsigned distance + 6-axis ray-escape vote instead: a
# point every axis ray can't escape from is inside the body.
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

# lift to guaranteed clearance: need-field dilated over rings, applied along
# the envelope's own smooth normals (never per-vert pushes against the bumpy
# body field). Total lift is capped: verts trapped in the enclosed
# under-canopy pocket misclassify as inside and would otherwise be shoved
# into a hanging curtain — the pocket is invisible from exterior views.
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

# verify: min clearance over verts, edge midpoints, face centroids
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
path = OUT + 'Ghibli_Tree_H.glb'
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True)
obj.location = orig_loc
print(f'envelope: {len(envmesh.vertices)} verts / {len(envmesh.polygons)} tris, {ncomps} remesh comps, lifts {lifts}, min clearance {mc:.4f}, {nlow} verts below floor, {os.path.getsize(path) // 1024}KB')
