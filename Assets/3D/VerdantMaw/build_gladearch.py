# build_gladearch.py — Soul Arch: a rock rib of the Well of Souls, the ruined
# ring around the Tree of Souls (placement [0] straddles the walk-in trail as
# the gateway). Bare violet-gray stone with glow-lichen dots, three hanging
# vines with light-bulb tips, rubble at the feet.
#
# MIRRORS js/scene/zones/VerdantMaw/canopy.js GLADE_ARCHES/ARCH_FEET: native
# feet at local x ±3.2, foot radius ~0.8 — both scale with the placement.
#
# Run headless:  blender -b --python build_gladearch.py
# Outputs models/Ember_GladeArch.glb; source GladeArch.blend (watched).
import bpy, bmesh, math, random, os, traceback

OUT_GLB = r'D:\1Under1OverToo\models\Ember_GladeArch.glb'
OUT_BLEND = r'D:\1Under1OverToo\Assets\3D\VerdantMaw\GladeArch.blend'
RENDER = r'C:\Users\Owner\AppData\Local\Temp\claude\D--1Under1OverToo\b5e6352a-c5fb-4c1f-81c3-c15da474a36b\scratchpad\soularch_check.png'

def lin(hexstr):
    v = [int(hexstr[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in v) + (1.0,)

def mat(name, hexstr, emissive=None, strength=1.6):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = lin(hexstr)
    bsdf.inputs['Roughness'].default_value = 1.0
    if emissive:
        bsdf.inputs['Emission Color'].default_value = lin(emissive)
        bsdf.inputs['Emission Strength'].default_value = strength
    m.use_backface_culling = True
    return m

def obj_from_bm(name, bm, mats):
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    for m in mats: ob.data.materials.append(m)
    bpy.context.scene.collection.objects.link(ob)
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

def blob(bm, cx, cy, cz, r, sx=1.0, sy=1.0, sz=1.0, seed=0):
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=2, radius=r)
    rnd = random.Random(seed)
    for v in tmp.verts:
        n = 1 + 0.18 * math.sin(v.co.x * 3.1 + rnd.random()) * math.sin(v.co.z * 2.7)
        v.co.x *= sx * n; v.co.y *= sy * n; v.co.z *= sz * n
        v.co.x += cx; v.co.y += cy; v.co.z += cz
    me = bpy.data.meshes.new('tmp'); tmp.to_mesh(me); tmp.free()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)

def tube(bm, p0, p1, r=0.1, n=8):
    dx = [p1[i] - p0[i] for i in range(3)]
    L = math.sqrt(sum(d * d for d in dx))
    if L < 1e-6: return
    d = [c / L for c in dx]
    up = (0, 0, 1) if abs(d[2]) < 0.95 else (1, 0, 0)
    sx = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]]
    sl = math.sqrt(sum(c * c for c in sx)); sx = [c / sl for c in sx]
    sy = [d[1] * sx[2] - d[2] * sx[1], d[2] * sx[0] - d[0] * sx[2], d[0] * sx[1] - d[1] * sx[0]]
    rings = []
    for p in (p0, p1):
        ringv = []
        for i in range(n):
            a = i / n * 2 * math.pi
            off = [r * (math.cos(a) * sx[k] + math.sin(a) * sy[k]) for k in range(3)]
            ringv.append(bm.verts.new((p[0] + off[0], p[1] + off[1], p[2] + off[2])))
        rings.append(ringv)
    loft(bm, rings, close_top=True, close_bottom=True)

# Arch centerline: feet at (±3.2, 0, 0), apex (0, 0, 4.6); slight y bow so
# the rib doesn't read as an extruded flat curve.
def arch_pt(a):
    return (3.2 * math.cos(a), 0.35 * math.sin(a) * math.sin(a * 2.3), 4.6 * (math.sin(a) ** 0.9))

try:
    bpy.ops.wm.read_homefile(use_empty=True)
    ROCK = mat('SoulRock', '5a4a42')
    LICH = mat('ArchLichenGlow', '2a2444', emissive='ffb060', strength=2.2)
    VINE = mat('ArchVine', '3c4a2c')
    BULB = mat('ArchBulbGlow', '183028', emissive='ffcf8f', strength=4.0)

    parts = []
    rnd = random.Random(51)

    # ── The rib ─────────────────────────────────────────────────────────────
    bm = bmesh.new()
    N = 22
    rings_ = []
    for i in range(N + 1):
        a = math.pi * i / N
        cx, cy, cz = arch_pt(a)
        t = math.sin(a)                     # 0 feet → 1 apex
        rr = 0.62 * (1 - t) + 0.40 * t
        wob = 1 + 0.14 * math.sin(a * 7 + 1.2) * (1 - t * 0.5)
        # ring in the plane ⊥ to the centerline — approximate with the local
        # tangent projected frame (chunky rock forgives the approximation)
        a2 = min(math.pi, a + 0.03)
        nx, ny, nz = [q - p for p, q in zip(arch_pt(max(0.0, a - 0.03)), arch_pt(a2))]
        L = math.sqrt(nx * nx + ny * ny + nz * nz); nx, ny, nz = nx / L, ny / L, nz / L
        # side vectors: world-y and tangent×y
        s2x, s2y, s2z = (nz, 0, -nx)
        sl = math.sqrt(s2x * s2x + s2z * s2z) or 1; s2x, s2z = s2x / sl, s2z / sl
        ringv = []
        for k in range(9):
            th = k / 9 * 2 * math.pi
            ox = rr * wob * (math.cos(th) * 0 + math.sin(th) * s2x)
            oy = rr * wob * (math.cos(th) * 1)
            oz = rr * wob * (math.sin(th) * s2z)
            ringv.append(bm.verts.new((cx + ox, cy + oy, cz + oz)))
        rings_.append(ringv)
    loft(bm, rings_, close_top=True, close_bottom=True)
    # foot rubble
    for sgn in (-1, 1):
        blob(bm, sgn * 3.2, 0.1, 0.05, 0.62, sx=1.3, sy=1.1, sz=0.55, seed=7 + sgn)
        blob(bm, sgn * 2.6, -0.5, 0.02, 0.3, sx=1.1, sy=1.0, sz=0.7, seed=17 + sgn)
    parts.append(obj_from_bm('SoulArch_Rib', bm, [ROCK]))

    # ── Glow lichen dots on the outer face ──────────────────────────────────
    bm = bmesh.new()
    for i in range(6):
        a = math.pi * (0.18 + 0.64 * i / 5) + rnd.uniform(-0.05, 0.05)
        cx, cy, cz = arch_pt(a)
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=1, radius=rnd.uniform(0.09, 0.14))
        for v in tmp.verts:
            v.co.x += cx + rnd.uniform(-0.1, 0.1)
            v.co.y += cy - 0.42
            v.co.z += cz + rnd.uniform(-0.15, 0.15)
        me = bpy.data.meshes.new('tmp'); tmp.to_mesh(me); tmp.free()
        bm.from_mesh(me); bpy.data.meshes.remove(me)
    parts.append(obj_from_bm('SoulArch_Lichen', bm, [LICH]))

    # ── Hanging vines with glow-bulb tips ───────────────────────────────────
    bm = bmesh.new()
    bmb = bmesh.new()
    for a, L in ((math.pi * 0.34, 1.5), (math.pi * 0.52, 1.9), (math.pi * 0.71, 1.2)):
        cx, cy, cz = arch_pt(a)
        top = (cx, cy, cz - 0.3)
        mid = (cx + rnd.uniform(-0.12, 0.12), cy + rnd.uniform(-0.1, 0.1), cz - 0.3 - L * 0.55)
        bot = (cx + rnd.uniform(-0.2, 0.2), cy + rnd.uniform(-0.15, 0.15), cz - 0.3 - L)
        tube(bm, top, mid, r=0.05, n=5)
        tube(bm, mid, bot, r=0.04, n=5)
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=1, radius=0.1)
        for v in tmp.verts:
            v.co.x += bot[0]; v.co.y += bot[1]; v.co.z += bot[2] - 0.06
        me = bpy.data.meshes.new('tmp'); tmp.to_mesh(me); tmp.free()
        bmb.from_mesh(me); bpy.data.meshes.remove(me)
    parts.append(obj_from_bm('SoulArch_Vines', bm, [VINE]))
    parts.append(obj_from_bm('SoulArch_Bulbs', bmb, [BULB]))

    coll = bpy.data.collections.new('Pandora_SoulArch')
    bpy.context.scene.collection.children.link(coll)
    coll['export_offset'] = [0, 0, 0]
    for ob in parts:
        for c in list(ob.users_collection): c.objects.unlink(ob)
        coll.objects.link(ob)

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)

    import mathutils
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            bpy.context.scene.render.engine = eng; break
        except Exception: pass
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3.0; sun.data.use_shadow = False
    sun.rotation_euler = (0.9, 0, 0.6)
    bpy.context.scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    cam.location = mathutils.Vector((6, -9, 9))
    look = mathutils.Vector((0, 0, 2.2))
    cam.rotation_euler = (look - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.resolution_x = 640
    bpy.context.scene.render.resolution_y = 640
    bpy.context.scene.render.filepath = RENDER
    bpy.ops.render.render(write_still=True)

    mn = [min(v.co[i] for ob in parts for v in ob.data.vertices) for i in range(3)]
    mx = [max(v.co[i] for ob in parts for v in ob.data.vertices) for i in range(3)]
    print('GLADEARCH_OK %.1f KB  bbox x[%.2f,%.2f] y[%.2f,%.2f] z[%.2f,%.2f]'
          % (os.path.getsize(OUT_GLB) / 1024, mn[0], mx[0], mn[1], mx[1], mn[2], mx[2]))
except Exception:
    print('GLADEARCH_FAIL: ' + traceback.format_exc()[-1600:])
