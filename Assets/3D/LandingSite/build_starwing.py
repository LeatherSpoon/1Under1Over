# build_starwing.py — the Starwing, round 2 (owner: "short and flat like a
# hamburger rather than long and shaft-like like a hot dog... a VTOL C130
# mixed with a bullet train — trust the source material — park it on its
# belly").
#
#   blender -b --factory-startup --python Assets/3D/LandingSite/build_starwing.py
#   (set STARWING_PHASE=BUILD for the bay cut + export; default INSPECT)
#
# Round-1 lessons encoded here:
#   - the raw is re-rolled with an elongated bbox_condition ([5,8,2]) AND the
#     source proportions are ENFORCED per-axis after orientation — Rodin's box
#     is a prior, not a promise (round 1 came back span == length and read as
#     a pancake at the fixed camera);
#   - orientation is derived numerically, never eyeballed: thickness = the
#     smallest span; belly = the broader outer slab (canopy+fins make the top
#     slab narrow); the TALLER length-end is the fin tail, so nose = the
#     other end, rotated to -Y (game +z);
#   - check renders (front/side/top) are written BEFORE any surgery.
import bpy, os, sys, math, json
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(HERE, '..', 'VerdantMaw'))
import rodin_process as rp

MODELS = r'D:\2Under2Over\models'
RENDERS = os.path.join(HERE, 'renders')
os.makedirs(RENDERS, exist_ok=True)

PHASE = os.environ.get('STARWING_PHASE', 'INSPECT')
# Source proportions (concept image): long hull, moderate delta span, sleek.
TARGET_LEN, TARGET_SPAN, TARGET_H = 26.0, 16.0, 6.5

bpy.ops.wm.read_homefile(use_empty=True)

meshes = rp.import_raw(os.path.join(HERE, 'rodin_Landing_Starwing_v2_raw.glb'))
obj = rp.join_parts(meshes)
obj.name = 'Landing_Starwing'
img = rp.find_diffuse(obj)
if img and (img.size[0] > 1024 or img.size[1] > 1024):
    img.scale(1024, 1024)  # hero asset — keep 1024
rp.collapse_material(obj, 'Starwing_Mat', None)
mat = obj.data.materials[0]
if img:
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = img
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])

vs = obj.data.vertices


def spans():
    mn = [min(v.co[i] for v in vs) for i in range(3)]
    mx = [max(v.co[i] for v in vs) for i in range(3)]
    return mn, mx, [mx[i] - mn[i] for i in range(3)]


# ── Orient numerically ───────────────────────────────────────────────────────
# 1. Thickness (smallest span) → Z.
mn, mx, sp = spans()
tk = sp.index(min(sp))
if tk == 0:
    obj.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Y'))   # X→Z
elif tk == 1:
    obj.data.transform(Matrix.Rotation(math.pi / 2, 4, 'X'))   # Y→Z
mn, mx, sp = spans()
# 2. Length (largest remaining span) → Y.
if sp[0] > sp[1]:
    obj.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Z'))   # X→Y
mn, mx, sp = spans()
print('AXES thickness->Z, length->Y: spans x %.2f y %.2f z %.2f' % tuple(sp))
# 3. Belly down: the outer 12%% slab with the LARGER footprint is the belly
#    (fins + canopy ridge make the top slab narrow).
def slab_area(sign):
    lo, hi = mn[2], mx[2]
    if sign < 0:
        band = [v.co for v in vs if v.co.z < lo + 0.12 * sp[2]]
    else:
        band = [v.co for v in vs if v.co.z > hi - 0.12 * sp[2]]
    if len(band) < 8:
        return 0
    return ((max(b.x for b in band) - min(b.x for b in band)) *
            (max(b.y for b in band) - min(b.y for b in band)))
if slab_area(1) > slab_area(-1):
    obj.data.transform(Matrix.Rotation(math.pi, 4, 'Y'))       # flip belly down
    mn, mx, sp = spans()
    print('  flipped belly-down')
# 4. Nose to -Y: the fin end is TALLER — whichever length-end band holds the
#    max z is the tail.
def end_height(sign):
    if sign < 0:
        band = [v.co.z for v in vs if v.co.y < mn[1] + 0.3 * sp[1]]
    else:
        band = [v.co.z for v in vs if v.co.y > mx[1] - 0.3 * sp[1]]
    return max(band) if band else 0
if end_height(-1) > end_height(1):
    obj.data.transform(Matrix.Rotation(math.pi, 4, 'Z'))       # spin nose to -Y
    mn, mx, sp = spans()
    print('  spun nose to -Y (tail was at -Y)')
print('ENDS nose(-Y) h %.2f  tail(+Y) h %.2f' % (end_height(-1), end_height(1)))

# ── Enforce the source proportions, ground, center ───────────────────────────
mn, mx, sp = spans()
sx = TARGET_SPAN / sp[0]
sy = TARGET_LEN / sp[1]
sz = min(TARGET_H / sp[2], sy)  # sleek cap; never stretch height past length factor
cx, cy = (mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2
for v in vs:
    v.co.x = (v.co.x - cx) * sx
    v.co.y = (v.co.y - cy) * sy
    v.co.z = (v.co.z - mn[2]) * sz
obj.data.update()
mn, mx, sp = spans()
print('NORMALIZED span %.1f len %.1f h %.1f (scale %.2f/%.2f/%.2f)'
      % (sp[0], sp[1], sp[2], sx, sy, sz))

# Aft roof map (x across, y toward tail) for the bay plan
for xg in (0.0, 1.5, 3.0):
    row = []
    for yg in [mx[1] - d for d in (9.0, 7.0, 5.0, 3.0, 1.5, 0.5)]:
        col = [v.co.z for v in vs if abs(v.co.x - xg) < 0.8 and abs(v.co.y - yg) < 0.7]
        row.append('%4.1f' % max(col) if col else '  . ')
    print('ROOF x %.1f (tail-9 .. tail-0.5): %s' % (xg, '  '.join(row)))
# Belly clearance along the aft centerline (is the underside grounded?)
for yg in [mx[1] - d for d in (9.0, 6.0, 3.0, 1.0)]:
    col = [v.co.z for v in vs if abs(v.co.x) < 1.2 and abs(v.co.y - yg) < 0.7]
    print('BELLY y tail-%.1f  minz %.2f' % (mx[1] - yg, min(col) if col else -1))

# Planform width along the length (for the JS collision chains)
for yg in [mn[1] + sp[1] * f for f in (0.04, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 0.98)]:
    band = [v.co.x for v in vs if abs(v.co.y - yg) < 0.7]
    if band:
        print('WIDTH y %+6.1f  x %.1f..%.1f' % (yg, min(band), max(band)))

tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
print('TRIS', tris)


def render_rig():
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            bpy.context.scene.render.engine = eng
            break
        except Exception:
            pass
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3.0
    sun.data.use_shadow = False
    sun.rotation_euler = (0.9, 0, 0.6)
    bpy.context.scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    bpy.context.scene.render.resolution_x = 900
    bpy.context.scene.render.resolution_y = 640
    return cam


def shot(cam, name, pos, look):
    cam.location = Vector(pos)
    cam.rotation_euler = (Vector(look) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = os.path.join(RENDERS, name)
    bpy.ops.render.render(write_still=True)


cam = render_rig()
L = TARGET_LEN
shot(cam, 'sw2_front.png', (0, -L * 1.2, L * 0.32), (0, 0, 2.2))
shot(cam, 'sw2_side.png', (L * 1.2, 0, L * 0.28), (0, 0, 2.2))
shot(cam, 'sw2_three_quarter.png', (L * 0.85, -L * 0.85, L * 0.5), (0, 0, 2))
shot(cam, 'sw2_tail.png', (L * 0.35, L * 0.95, L * 0.3), (0, mx[1] - 4, 1.5))

if PHASE == 'INSPECT':
    print('INSPECT DONE')
    sys.exit(0)

# ── BUILD: the rear cargo bay (C-130 grammar: straight out the tail) ─────────
# Numbers below are re-checked against the ROOF/BELLY probes each run.
import bmesh
BAY = json.loads(os.environ.get('STARWING_BAY', '{"x0":-1.7,"x1":1.7,"z1":2.8,"y0":4.0,"yout":2.0}'))
mn, mx, sp = spans()
y1 = mx[1] + BAY['yout']          # cut runs out past the tail face
y0 = mx[1] - BAY['y0'] - 6.0      # ...and this deep into the hull
cutter = bpy.data.objects.new('BayCutter', bpy.data.meshes.new('BayCutter'))
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1)
for v in bm.verts:
    v.co.x = (BAY['x0'] + BAY['x1']) / 2 + v.co.x * (BAY['x1'] - BAY['x0'])
    v.co.y = (y0 + y1) / 2 + v.co.y * (y1 - y0)
    v.co.z = (BAY['z1'] / 2 - 0.4) + v.co.z * (BAY['z1'] + 0.8)
bm.to_mesh(cutter.data)
bm.free()
bpy.context.scene.collection.objects.link(cutter)
mod = obj.modifiers.new('bay', 'BOOLEAN')
mod.operation = 'DIFFERENCE'
mod.solver = 'EXACT'
mod.object = cutter
bpy.context.view_layer.objects.active = obj
bpy.ops.object.modifier_apply(modifier='bay')
bpy.data.objects.remove(cutter, do_unlink=True)


def flat_mat(name, color, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = 1.0
    if emit > 0:
        b.inputs['Emission Color'].default_value = (*color, 1)
        b.inputs['Emission Strength'].default_value = emit
    return m


def srgb(hexv):
    c = [(hexv >> 16 & 255) / 255, (hexv >> 8 & 255) / 255, (hexv & 255) / 255]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


hull_dark = flat_mat('Bay_Hull', srgb(0x2c3038))
deck_mat = flat_mat('Bay_Deck', srgb(0x3a4048))
glow_mat = flat_mat('Bay_Glow', srgb(0x35e0d8), emit=4.0)
door_mat = flat_mat('Bay_Door', srgb(0x1a4a50), emit=1.2)


def box(name, m, x0, x1, y0b, y1b, z0, z1):
    me = bpy.data.meshes.new(name)
    bx = bmesh.new()
    bmesh.ops.create_cube(bx, size=1)
    for v in bx.verts:
        v.co.x = (x0 + x1) / 2 + v.co.x * (x1 - x0)
        v.co.y = (y0b + y1b) / 2 + v.co.y * (y1b - y0b)
        v.co.z = (z0 + z1) / 2 + v.co.z * (z1 - z0)
    bx.to_mesh(me)
    bx.free()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(m)
    bpy.context.scene.collection.objects.link(ob)
    return ob


bx0, bx1, bz1 = BAY['x0'], BAY['x1'], BAY['z1']
# The hull's CENTER section ends ~3 units before the boom-defined tail
# (probes: center geometry stops past tail-3) — the liner must stay inside
# it or it reads as a box appended behind the ship.
aft_face = mx[1] - 3.4
deck_out = mx[1] - 2.0   # short lip past the mouth, under the tail sweep
inner = y0 + 0.05
parts = [
    box('BayDeck', deck_mat, bx0 + 0.06, bx1 - 0.06, inner, deck_out, 0.0, 0.06),
    box('BayWallL', hull_dark, bx0 + 0.06, bx0 + 0.16, inner, aft_face, 0.0, bz1 - 0.04),
    box('BayWallR', hull_dark, bx1 - 0.16, bx1 - 0.06, inner, aft_face, 0.0, bz1 - 0.04),
    box('BayCeil', hull_dark, bx0 + 0.06, bx1 - 0.06, inner, aft_face - 0.2, bz1 - 0.1, bz1 - 0.02),
    box('BayEnd', hull_dark, bx0 + 0.06, bx1 - 0.06, inner - 0.1, inner, 0.0, bz1 - 0.04),
    box('BayDoor', door_mat, bx0 + 0.7, bx1 - 0.7, inner + 0.01, inner + 0.04, 0.1, bz1 - 0.5),
    box('BayStripL', glow_mat, bx0 + 0.17, bx0 + 0.22, inner + 0.1, aft_face - 0.3, bz1 - 0.6, bz1 - 0.5),
    box('BayStripR', glow_mat, bx1 - 0.22, bx1 - 0.17, inner + 0.1, aft_face - 0.3, bz1 - 0.6, bz1 - 0.5),
]
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
for p in parts:
    p.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.join()

tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
print('BUILD TRIS', tris)

for o in bpy.data.objects:
    o.select_set(o is obj)
bpy.context.view_layer.objects.active = obj
out = os.path.join(MODELS, 'Landing_Starwing.glb')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True)
print('EXPORTED %s (%d KB)' % (out, os.path.getsize(out) // 1024))

shot(cam, 'sw2_bay.png', (6, mx[1] + 12, 5.5), (0, mx[1] - 2, 1.4))
shot(cam, 'sw2_bay_close.png', (0, mx[1] + 8, 1.9), (0, mx[1] - 4, 1.3))
shot(cam, 'sw2_final.png', (L * 0.8, -L * 0.75, L * 0.5), (0, 0, 2))

coll = bpy.data.collections.new('Landing_Starwing')
bpy.context.scene.collection.children.link(coll)
coll['export_offset'] = [0, 0, 0]
for c in list(obj.users_collection):
    c.objects.unlink(obj)
coll.objects.link(obj)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'Starwing.blend'))
print('BUILD DONE')
