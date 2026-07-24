# Baked outline hulls for the tundra snow pines — smooth strictly-containing
# envelope (recipe from Assets/3D/LandingProps/hull_envelope.py, generalized).
# A smooth closed envelope containing the body with clearance > chord error can
# never cross it, so interior ink artifacts are geometrically impossible.
# Run via the blender-mcp socket with FrozenTundra.blend open.
import bpy, bmesh, math, mathutils
from mathutils.bvhtree import BVHTree

TARGETS = globals().get('HULL_TARGETS', ['Tundra_SnowPine', 'Tundra_SnowPineSquat'])
TARGET = 0.05        # clearance = ink boldness
FLOOR = 0.028        # verified minimum clearance
VOXEL = 0.08
# Snow-tier recesses swallow a tight envelope: unlike TreeH's enclosed
# under-canopy pocket there is no cavity to protect here, so the lift cap is
# generous and a uniform base inflate precedes the need-field rounds.
LIFT_CAP = 0.35
BASE_INFLATE = 0.04
SMOOTH_ROUNDS = 6
LIFT_ROUNDS = 8

black = bpy.data.materials.get('OutlineBlack')
if black is None:
    black = bpy.data.materials.new('OutlineBlack')
    black.use_nodes = False
    black.diffuse_color = (0, 0, 0, 1)
black.use_backface_culling = True

report = []
for tname in TARGETS:
    obj = bpy.data.objects[tname]
    obj.rotation_mode = 'XYZ'
    hull_name = tname + '_OutlineHull'
    old = bpy.data.objects.get(hull_name)
    if old:
        m = old.data
        bpy.data.objects.remove(old, do_unlink=True)
        if m and m.users == 0:
            bpy.data.meshes.remove(m)

    # body copy with debris removed (a remeshed shard becomes a black ball)
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
    clean_mesh = bpy.data.meshes.new(tname + '_env_src')
    src_bm.to_mesh(clean_mesh)
    dup.data = clean_mesh
    dup.name = hull_name
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
    envmesh.name = hull_name

    bm = bmesh.new()
    bm.from_mesh(envmesh)

    # keep only the largest remesh component (soup emits interior shells)
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

    for _ in range(SMOOTH_ROUNDS):
        bmesh.ops.smooth_vert(bm, verts=bm.verts[:], factor=0.5,
                              use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(4.0),
                             verts=bm.verts[:], edges=bm.edges[:])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.normal_update()

    # winding-independent clearance (Rodin soup has flipped-normal patches):
    # unsigned distance + ray-escape vote. 6 axis rays misclassify points in
    # open slots between snow tiers (every axis ray hits a fin) — the 8 corner
    # diagonals escape those slots radially, so 14 rays vote.
    s3 = 1.0 / math.sqrt(3.0)
    AXES = [mathutils.Vector(a) for a in
            ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1),
             (s3, s3, s3), (s3, s3, -s3), (s3, -s3, s3), (s3, -s3, -s3),
             (-s3, s3, s3), (-s3, s3, -s3), (-s3, -s3, s3), (-s3, -s3, -s3))]

    def clearance(p):
        loc, nrm, idx, dist = bvh.find_nearest(p)
        if loc is None:
            return TARGET
        u = (p - loc).length
        for d in AXES:
            if bvh.ray_cast(p, d, 4.0)[0] is None:
                return u
        return -u

    # uniform base inflate before the need-field rounds
    for v in bm.verts:
        v.co += v.normal * BASE_INFLATE
    bm.normal_update()
    total_lift = {v: 0.0 for v in bm.verts}

    def lift_round():
        # need is sampled everywhere verification samples: verts, edge
        # midpoints, and face centroids (a face can sag into a bump even
        # when all its verts clear).
        need = {}
        for v in bm.verts:
            need[v] = max(0.0, TARGET - clearance(v.co))
        for e in bm.edges:
            d = max(0.0, TARGET - clearance((e.verts[0].co + e.verts[1].co) * 0.5))
            if d > 0:
                for v in e.verts:
                    need[v] = max(need[v], d)
        for f in bm.faces:
            d = max(0.0, TARGET - clearance(f.calc_center_median()))
            if d > 0:
                for v in f.verts:
                    need[v] = max(need[v], d)
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

    for _ in range(LIFT_ROUNDS):
        if lift_round() == 0:
            break

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
    ntris = len(bm.faces)

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
    report.append({'name': tname, 'min_clearance': round(mc, 4), 'verts_below_floor': nlow, 'tris': ntris})

import json
print(json.dumps(report))
