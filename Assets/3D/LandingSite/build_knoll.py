# build_knoll.py — authors Landing_LookoutKnoll.glb (run inside Blender via MCP).
#
# MIRRORS js/scene/zones/LandingSite/knoll.js:
#   KNOLL coreR 2.6 topY 3.0
#   HELIX rMid 3.55 halfW 0.8 th0 pi/2 th1 pi/2+1.5pi y0 0 y1 2.9
#   LEDGE r 2.2 y 3.0, STEP east face 2.9 -> 3.0
# Game (x, z) = Blender (x, -y); heights on Blender Z. Palette matches the
# zone's mountain (stone 8899aa / 6d7d88) and ground (5a8c3c).

import bpy, bmesh, math, random, os

OUT_DIR = r'D:\1Under1OverToo\models'
RMID, HALFW = 3.55, 0.8
TH0, TH1 = math.pi / 2, math.pi / 2 + 1.5 * math.pi
Y1, LEDGE_Y, LEDGE_R = 2.9, 3.0, 2.2

def lin(hexstr):
    v = [int(hexstr[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in v) + (1.0,)

def mat(name, hexstr):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = lin(hexstr)
    b.inputs['Roughness'].default_value = 1.0
    m.use_backface_culling = True
    return m

def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)

def obj_from_bm(name, bm, mats):
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    for m in mats: ob.data.materials.append(m)
    bpy.context.collection.objects.link(ob)
    return ob

def loft(bm, rings, close_top=False, close_bottom=False, mat_index=0):
    for a, b in zip(rings, rings[1:]):
        n = len(a)
        for i in range(n):
            f = bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
            f.material_index = mat_index
    if close_bottom:
        f = bm.faces.new(tuple(reversed(rings[0]))); f.material_index = mat_index
    if close_top:
        f = bm.faces.new(rings[-1]); f.material_index = mat_index

def ring(bm, cx, cy, z, r, n=14, wob=0.0, seed=0):
    rnd = random.Random(seed)
    ph = rnd.uniform(0, 6.28)
    pts = []
    for i in range(n):
        a = i / n * 2 * math.pi
        rr = r * (1 + wob * math.sin(3 * a + ph) * 0.5 + wob * math.sin(5 * a + ph * 1.7) * 0.5)
        pts.append(bm.verts.new((cx + rr * math.cos(a), cy + rr * math.sin(a), z)))
    return pts

def blob(bm, cx, cy, cz, r, sx=1.0, sy=1.0, sz=1.0, seed=0):
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=1, radius=r)
    rnd = random.Random(seed)
    for v in tmp.verts:
        n = 1 + 0.2 * math.sin(v.co.x * 4.1 + rnd.random() * 6)
        v.co.x = v.co.x * sx * n + cx; v.co.y = v.co.y * sy * n + cy; v.co.z = v.co.z * sz * n + cz
    me = bpy.data.meshes.new('tmp'); tmp.to_mesh(me); tmp.free()
    bm.from_mesh(me); bpy.data.meshes.remove(me)

def hy(th): return (th - TH0) / (TH1 - TH0) * Y1
def hpt(th, r, z): return (r * math.cos(th), -r * math.sin(th), z)

clear_scene()
parts = []

# Rock core — craggy loft, capped under the grass ledge
bm = bmesh.new()
prof = [(0.0, 3.05), (0.7, 2.95), (1.5, 2.8), (2.3, 2.55), (2.9, 2.35)]
rings_ = [ring(bm, 0, 0, z, r, n=13, wob=0.09, seed=int(z * 7) + 1) for z, r in prof]
loft(bm, rings_, close_top=True, close_bottom=True)
# Base boulders
for i in range(4):
    a = i / 4 * 2 * math.pi + 0.6
    blob(bm, 3.1 * math.cos(a), 3.1 * math.sin(a), 0.25, 0.6, sx=1.3, sy=0.9, sz=0.7, seed=i)
parts.append(obj_from_bm('Knoll_Rock', bm, [mat('KnollStone', '8899aa')]))

# Shelf ramp — stone strip with a grass top runner, exact helix heights
bm = bmesh.new()
N = 70
ti, to, bo, bi = [], [], [], []
for i in range(N + 1):
    th = TH0 + (TH1 - TH0) * i / N
    z = hy(th)
    ti.append(bm.verts.new(hpt(th, 2.6, z)))
    to.append(bm.verts.new(hpt(th, 4.5, z)))
    bo.append(bm.verts.new(hpt(th, 4.3, z - 0.4)))
    bi.append(bm.verts.new(hpt(th, 2.6, z - 0.4)))
for i in range(N):
    f = bm.faces.new((ti[i], to[i], to[i + 1], ti[i + 1])); f.material_index = 1  # grass top
    for a, b in ((to, bo), (bo, bi), (bi, ti)):
        bm.faces.new((a[i], b[i], b[i + 1], a[i + 1]))
bm.faces.new((ti[0], to[0], bo[0], bi[0]))
bm.faces.new(tuple(reversed((ti[N], to[N], bo[N], bi[N]))))
# Step onto the ledge (east face): short strip 2.9 -> 3.0
sa, sb = [], []
for j, (r0, r1) in enumerate(((3.9, 3.9), (1.1, 1.1))):
    z = 2.9 + 0.1 * j
    sa.append(bm.verts.new((r0, 0.9, z)))
    sb.append(bm.verts.new((r1, -0.9, z)))
f = bm.faces.new((sa[0], sb[0], sb[1], sa[1])); f.material_index = 1
parts.append(obj_from_bm('Knoll_Shelf', bm, [mat('KnollStoneDark', '6d7d88'), mat('KnollGrass', '5a8c3c')]))

# Grass ledge — flat at exactly LEDGE_Y, skirt folding down to the rock
bm = bmesh.new()
top = ring(bm, 0, 0, LEDGE_Y, 2.38, n=16, wob=0.05, seed=9)
skirt = ring(bm, 0, 0, LEDGE_Y - 0.35, 2.2, n=16, seed=10)
center = bm.verts.new((0, 0, LEDGE_Y))
for i in range(16):
    bm.faces.new((center, top[i], top[(i + 1) % 16]))
loft(bm, [top, skirt])
parts.append(obj_from_bm('Knoll_Ledge', bm, [mat('KnollGrass', '5a8c3c')]))

# Daisies on the ledge — tiny white/gold dots
bm = bmesh.new()
rnd = random.Random(31)
for i in range(9):
    a = rnd.uniform(0, 6.28); rr = rnd.uniform(0.5, 1.9)
    blob(bm, rr * math.cos(a), rr * math.sin(a), LEDGE_Y + 0.05, 0.06, seed=40 + i)
parts.append(obj_from_bm('Knoll_Daisies', bm, [mat('KnollDaisy', 'f2ead0')]))

# Baked outline hull for the CLOSED masses only (rock + ledge) — flipped-normal
# inflated shells. Its presence makes the game skip its runtime auto-hull, so
# the thin shelf strip / step quad / daisies get no hull at all (a runtime hull
# on those painted them solid black — the tent lesson, single-surface shells).
bm = bmesh.new()
for src_name in ('Knoll_Rock', 'Knoll_Ledge'):
    src = bpy.data.objects[src_name]
    tmp = bmesh.new()
    tmp.from_mesh(src.data)
    tmp.normal_update()
    for v in tmp.verts:
        v.co += v.normal * 0.055
    me = bpy.data.meshes.new('tmp'); tmp.to_mesh(me); tmp.free()
    bm.from_mesh(me); bpy.data.meshes.remove(me)
bmesh.ops.reverse_faces(bm, faces=bm.faces)
hull_me = bpy.data.meshes.new('Knoll_OutlineHull')
bm.to_mesh(hull_me); bm.free()
hull = bpy.data.objects.new('Knoll_OutlineHull', hull_me)
ink = mat('KnollInk', '000000')
hull.data.materials.append(ink)
bpy.context.collection.objects.link(hull)
parts.append(hull)

bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
path = os.path.join(OUT_DIR, 'Landing_LookoutKnoll.glb')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True)
bpy.ops.wm.save_as_mainfile(filepath=r'D:\1Under1OverToo\Assets\3D\LandingSite\Knoll.blend')
print('KNOLL_EXPORTED kb=' + str(round(os.path.getsize(path) / 1024, 1)))
