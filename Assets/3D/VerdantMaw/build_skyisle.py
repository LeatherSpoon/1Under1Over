# build_skyisle.py — Sky Isle: a small Hallelujah-range outlier adrift over
# the Emberglade. Inverted-teardrop rock, mossy crown, hanging root-vines
# with glow tips. VISUAL ONLY in-game (placed at y ≥ 9.8, no collision).
#
# Native size ~4.6 wide × ~4.5 tall incl. roots; placements scale 0.85–1.5
# (js/scene/zones/VerdantMaw/canopy.js SKY_ISLES).
#
# Run headless:  blender -b --python build_skyisle.py
# Outputs models/Pandora_SkyIsle.glb; source SkyIsle.blend (watched).
import bpy, bmesh, math, random, os, traceback

OUT_GLB = r'D:\1Under1OverToo\models\Pandora_SkyIsle.glb'
OUT_BLEND = r'D:\1Under1OverToo\Assets\3D\VerdantMaw\SkyIsle.blend'
RENDER = r'C:\Users\Owner\AppData\Local\Temp\claude\D--1Under1OverToo\b5e6352a-c5fb-4c1f-81c3-c15da474a36b\scratchpad\skyisle_check.png'

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

def tube(bm, p0, p1, r=0.1, n=6):
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

try:
    bpy.ops.wm.read_homefile(use_empty=True)
    ROCK = mat('IsleRock', '463c58')
    MOSS = mat('IsleMoss', '2e5f4a')
    VINE = mat('IsleVine', '24402f')
    BULB = mat('IsleBulbGlow', '183028', emissive='ffcf8f', strength=3.6)
    SHRM = mat('IsleShroomGlow', '1c1838', emissive='ffb866', strength=3.2)

    parts = []
    rnd = random.Random(2154)  # the year, for luck

    # ── Body: noisy icosphere → inverted teardrop, moss faces on top ────────
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.9)
    for v in bm.verts:
        n = 1 + 0.22 * math.sin(v.co.x * 2.6 + 0.8) * math.sin(v.co.y * 3.1 + 2.0) \
              + 0.1 * math.sin(v.co.z * 4.2)
        v.co.x *= 1.25 * n; v.co.y *= 1.05 * n; v.co.z *= 0.8 * n
        if v.co.z < -0.2:                       # taper the underside to a keel
            t = min(1.0, (-0.2 - v.co.z) / 1.4)
            v.co.x *= 1 - 0.68 * t; v.co.y *= 1 - 0.68 * t
            v.co.z *= 1.55
    me = bpy.data.meshes.new('IsleBody')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # material split: top-facing high faces get moss
    for f in bm.faces:
        c = f.calc_center_median()
        f.material_index = 1 if (f.normal.z > 0.45 and c.z > 0.25) else 0
    bm.to_mesh(me); bm.free()
    body = bpy.data.objects.new('SkyIsle_Body', me)
    body.data.materials.append(ROCK); body.data.materials.append(MOSS)
    bpy.context.scene.collection.objects.link(body)
    parts.append(body)

    # ── Hanging root-vines with glow tips + top glow shrooms ────────────────
    bm = bmesh.new()
    bmb = bmesh.new()
    for i in range(5):
        a = i / 5 * 2 * math.pi + rnd.uniform(0, 0.5)
        bx, by = 0.9 * math.cos(a), 0.75 * math.sin(a)
        bz = -1.4 - rnd.uniform(0, 0.5)
        L = rnd.uniform(1.0, 2.0)
        mid = (bx + rnd.uniform(-0.15, 0.15), by + rnd.uniform(-0.15, 0.15), bz - L * 0.55)
        bot = (bx + rnd.uniform(-0.25, 0.25), by + rnd.uniform(-0.2, 0.2), bz - L)
        tube(bm, (bx, by, bz + 0.3), mid, r=0.055, n=5)
        tube(bm, mid, bot, r=0.04, n=5)
        if i % 2 == 0:
            tmp = bmesh.new()
            bmesh.ops.create_icosphere(tmp, subdivisions=1, radius=0.09)
            for v in tmp.verts:
                v.co.x += bot[0]; v.co.y += bot[1]; v.co.z += bot[2] - 0.05
            me2 = bpy.data.meshes.new('tmp'); tmp.to_mesh(me2); tmp.free()
            bmb.from_mesh(me2); bpy.data.meshes.remove(me2)
    vines = bpy.data.meshes.new('SkyIsle_Vines'); bm.to_mesh(vines); bm.free()
    ob = bpy.data.objects.new('SkyIsle_Vines', vines)
    ob.data.materials.append(VINE); bpy.context.scene.collection.objects.link(ob); parts.append(ob)
    bulbs = bpy.data.meshes.new('SkyIsle_Bulbs'); bmb.to_mesh(bulbs); bmb.free()
    ob = bpy.data.objects.new('SkyIsle_Bulbs', bulbs)
    ob.data.materials.append(BULB); bpy.context.scene.collection.objects.link(ob); parts.append(ob)

    bm = bmesh.new()
    for i in range(3):
        a = i / 3 * 2 * math.pi + 0.7
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=1, radius=rnd.uniform(0.1, 0.15))
        for v in tmp.verts:
            v.co.x += 1.15 * math.cos(a); v.co.y += 1.0 * math.sin(a); v.co.z += 1.28
        me2 = bpy.data.meshes.new('tmp'); tmp.to_mesh(me2); tmp.free()
        bm.from_mesh(me2); bpy.data.meshes.remove(me2)
    shr = bpy.data.meshes.new('SkyIsle_Shrooms'); bm.to_mesh(shr); bm.free()
    ob = bpy.data.objects.new('SkyIsle_Shrooms', shr)
    ob.data.materials.append(SHRM); bpy.context.scene.collection.objects.link(ob); parts.append(ob)

    coll = bpy.data.collections.new('Pandora_SkyIsle')
    bpy.context.scene.collection.children.link(coll)
    coll['export_offset'] = [0, 0, 0]
    for o in parts:
        for c in list(o.users_collection): c.objects.unlink(o)
        coll.objects.link(o)

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
    cam.location = mathutils.Vector((5.5, -7, 6))
    look = mathutils.Vector((0, 0, 0))
    cam.rotation_euler = (look - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.resolution_x = 640
    bpy.context.scene.render.resolution_y = 640
    bpy.context.scene.render.filepath = RENDER
    bpy.ops.render.render(write_still=True)

    mn = [min(v.co[i] for o in parts for v in o.data.vertices) for i in range(3)]
    mx = [max(v.co[i] for o in parts for v in o.data.vertices) for i in range(3)]
    print('SKYISLE_OK %.1f KB  bbox x[%.2f,%.2f] y[%.2f,%.2f] z[%.2f,%.2f]'
          % (os.path.getsize(OUT_GLB) / 1024, mn[0], mx[0], mn[1], mx[1], mn[2], mx[2]))
except Exception:
    print('SKYISLE_FAIL: ' + traceback.format_exc()[-1600:])
