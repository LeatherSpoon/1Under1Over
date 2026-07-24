# Normalize + bake envelope outline hull + export the Maw-tender homes.
# Hull recipe = the proven single-mass envelope pass (voxel remesh -> largest
# component -> smooth -> lift-to-clearance -> flip) from the tree round.
import bpy, bmesh, math, json
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

assert bpy.data.filepath.endswith('VerdantMaw.blend'), 'WRONG FILE: ' + bpy.data.filepath

HOMES = [('Home_Bram', 2.4), ('Home_Sprig', 1.8)]
try:
    HOMES = HOMES_OVERRIDE
except NameError:
    pass

TARGET = 0.05
FLOOR = 0.028
VOXEL = 0.08
LIFT_CAP = 0.09

black = bpy.data.materials.get('OutlineBlack')
if black is None:
    black = bpy.data.materials.new('OutlineBlack')
    black.use_nodes = True
    b = black.node_tree.nodes.get('Principled BSDF')
    if b:
        b.inputs['Base Color'].default_value = (0, 0, 0, 1)
        b.inputs['Roughness'].default_value = 1.0
    black.use_backface_culling = True

report = {}
for KEY, TARGET_H in HOMES:
    obj = bpy.data.objects[KEY]

    # ── normalize: scale to TARGET_H, bake center-XY + ground into mesh data ──
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    zs0 = [v.co.z for v in obj.data.vertices]
    s = TARGET_H / (max(zs0) - min(zs0))
    obj.scale = (obj.scale[0] * s, obj.scale[1] * s, obj.scale[2] * s)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    xs = [v.co.x for v in obj.data.vertices]
    ys = [v.co.y for v in obj.data.vertices]
    zs = [v.co.z for v in obj.data.vertices]
    obj.data.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs))))
    obj.data.update()
    for mat in obj.data.materials:
        if mat and mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED':
                    n.inputs['Roughness'].default_value = 1.0
                    n.inputs['Metallic'].default_value = 0.0

    # ── envelope hull ─────────────────────────────────────────────────────────
    old = bpy.data.objects.get(KEY + '_OutlineHull')
    if old:
        m = old.data
        bpy.data.objects.remove(old, do_unlink=True)
        if m and m.users == 0: bpy.data.meshes.remove(m)
    src_bm = bmesh.new()
    src_bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(src_bm, verts=src_bm.verts, dist=0.002)
    visited = set(); drop = []
    for v in src_bm.verts:
        if v in visited: continue
        stack = [v]; seen = set()
        while stack:
            u = stack.pop()
            if u in seen: continue
            seen.add(u)
            for e in u.link_edges:
                w = e.other_vert(u)
                if w not in seen: stack.append(w)
        visited |= seen
        if len(seen) < 300: drop.extend(seen)
    if drop: bmesh.ops.delete(src_bm, geom=drop, context='VERTS')
    bvh = BVHTree.FromBMesh(src_bm)
    dup = obj.copy()
    clean_mesh = bpy.data.meshes.new(KEY + '_env_src')
    src_bm.to_mesh(clean_mesh)
    dup.data = clean_mesh
    dup.name = KEY + '_OutlineHull'
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
    envmesh.name = KEY + '_OutlineHull'
    bm = bmesh.new()
    bm.from_mesh(envmesh)
    visited = set(); comps = []
    for v in bm.verts:
        if v in visited: continue
        stack = [v]; seen = set()
        while stack:
            u = stack.pop()
            if u in seen: continue
            seen.add(u)
            for e in u.link_edges:
                w = e.other_vert(u)
                if w not in seen: stack.append(w)
        visited |= seen
        comps.append(seen)
    comps.sort(key=len, reverse=True)
    inner = [v for c in comps[1:] for v in c]
    ncomps = len(comps)
    if inner: bmesh.ops.delete(bm, geom=inner, context='VERTS')
    for _ in range(8):
        bmesh.ops.smooth_vert(bm, verts=bm.verts[:], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(4.0), verts=bm.verts[:], edges=bm.edges[:])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.normal_update()
    AXES = [Vector(a) for a in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))]
    def clearance(p):
        loc, nrm, idx, dist = bvh.find_nearest(p)
        if loc is None: return TARGET
        u = (p - loc).length
        for d in AXES:
            if bvh.ray_cast(p, d, 3.0)[0] is None: return u
        return -u
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
    def min_clearance():
        md = 1e9
        for v in bm.verts: md = min(md, clearance(v.co))
        for e in bm.edges: md = min(md, clearance((e.verts[0].co + e.verts[1].co) * 0.5))
        for f in bm.faces: md = min(md, clearance(f.calc_center_median()))
        return md
    mc = min_clearance()
    nlow = sum(1 for v in bm.verts if clearance(v.co) < FLOOR)
    for f in bm.faces: f.normal_flip()
    bm.to_mesh(envmesh)
    bm.free(); src_bm.free()
    envmesh.materials.clear()
    envmesh.materials.append(black)
    dup.parent = obj
    dup.location = (0, 0, 0)
    dup.rotation_mode = 'XYZ'
    dup.rotation_euler = (0, 0, 0)
    dup.scale = (1, 1, 1)

    # ── export (mesh data is centered/grounded, so origin placement is exact) ─
    orig_loc = tuple(obj.location)
    obj.location = (0, 0, 0)
    bpy.context.view_layer.update()
    for o in bpy.data.objects: o.select_set(o == obj or o == dup)
    bpy.context.view_layer.objects.active = obj
    path = 'D:/1Under1OverToo/models/' + KEY + '.glb'
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_animations=False)
    obj.location = orig_loc
    report[KEY] = {'tris': len(envmesh.polygons), 'remesh_comps': ncomps, 'lifts': lifts, 'min_clearance': round(mc, 4), 'below_floor': nlow, 'H': TARGET_H}

bpy.ops.wm.save_mainfile()
print(json.dumps(report))
