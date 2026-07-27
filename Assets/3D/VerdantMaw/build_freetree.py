# build_freetree.py — the Great Tree: a free-standing canopy giant for the
# Verdant Maw's North Reach arc. The owner asked for "a tree that does not
# attach to the second level" — so this one carries NO ramp, NO pad, NO
# walkable anything: the corridor's bridges circle it while it ignores them.
# Trunk grounded at Z 0, crown top ~10; game placement scale 1.0 at
# canopy.js GREAT_TREE (ground trunk collision only, reveal-shaded so it
# opens around players walking behind it).
#
# Run headless:  blender -b --python build_freetree.py
# Outputs models/Pandora_GreatTree.glb; source GreatTree.blend (watched).
import bpy, bmesh, math, random, os, traceback

OUT_GLB = r'D:\1Under1OverToo\models\Pandora_GreatTree.glb'
OUT_BLEND = r'D:\1Under1OverToo\Assets\3D\VerdantMaw\GreatTree.blend'

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
    bmesh.ops.create_icosphere(tmp, subdivisions=2, radius=r)
    rnd = random.Random(seed)
    for v in tmp.verts:
        n = 1 + 0.17 * math.sin(v.co.x * 3.1 + rnd.random()) * math.sin(v.co.z * 2.7)
        v.co.x *= sx * n; v.co.y *= sy * n; v.co.z *= sz * n
        v.co.x += cx; v.co.y += cy; v.co.z += cz
    me = bpy.data.meshes.new('tmp'); tmp.to_mesh(me); tmp.free()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)

try:
    bpy.ops.wm.read_homefile(use_empty=True)
    BARK = mat('GreatTreeBark', '3a2b44')
    LEAF = mat('GreatTreeLeaf', '1e4a3c')
    LEAF2 = mat('GreatTreeLeafViolet', '5a3f7a')
    GLOW = mat('GreatTreeGlow', '103830', emissive='7fffd8', strength=2.2)

    parts = []
    # Trunk — tall, slim, leaning slightly; bark wobble; flared base
    bm = bmesh.new()
    prof = [(0.0, 1.5), (0.8, 1.28), (2.2, 1.1), (3.8, 0.98), (5.4, 0.9), (6.6, 0.84), (7.6, 0.8)]
    rings_ = []
    for z, r in prof:
        lean = 0.22 * (z / 7.6) ** 1.4
        rings_.append(ring(bm, lean, lean * 0.5, z, r, n=14, wob=0.09, seed=int(z * 13)))
    loft(bm, rings_, close_top=True, close_bottom=True)
    # Buttress roots — five lobes half-sunk at the flare
    for i in range(5):
        a = i / 5 * 2 * math.pi + 0.6
        blob(bm, 1.55 * math.cos(a), 1.55 * math.sin(a), 0.1, 0.5, sx=1.6, sy=0.7, sz=0.5, seed=i)
    parts.append(obj_from_bm('GreatTree_Trunk', bm, [BARK]))

    # Crown — three tiers of billowing masses around the trunk top. Widest
    # reach ~2.9, so at game scale 1.0 it clears every North Reach span
    # (nearest bridge line is 4.35 out).
    bm = bmesh.new()
    rnd = random.Random(19)
    for i in range(6):
        a = i / 6 * 2 * math.pi + rnd.uniform(0, 0.45)
        rr = rnd.uniform(1.2, 2.1)
        blob(bm, rr * math.cos(a) + 0.2, rr * math.sin(a) + 0.1, rnd.uniform(7.4, 8.2),
             rnd.uniform(1.1, 1.5), sx=1.3, sy=1.3, sz=0.75, seed=30 + i)
    for i in range(4):
        a = i / 4 * 2 * math.pi + 0.9
        blob(bm, 1.1 * math.cos(a) + 0.25, 1.1 * math.sin(a) + 0.12, rnd.uniform(8.6, 9.2),
             rnd.uniform(1.0, 1.3), sx=1.25, sy=1.25, sz=0.75, seed=40 + i)
    blob(bm, 0.3, 0.15, 9.7, 1.25, sx=1.3, sy=1.3, sz=0.8, seed=50)
    parts.append(obj_from_bm('GreatTree_Crown', bm, [LEAF]))
    bm = bmesh.new()
    blob(bm, -1.7, 0.9, 8.5, 0.85, sx=1.2, sy=1.2, sz=0.75, seed=61)
    blob(bm, 1.9, -0.8, 8.9, 0.75, sx=1.2, sy=1.2, sz=0.75, seed=62)
    parts.append(obj_from_bm('GreatTree_CrownAccent', bm, [LEAF2]))

    # Glow — a climbing bark vein + hanging glow fruit under the crown skirt
    bm = bmesh.new()
    va, vb = [], []
    for i in range(25):
        t = i / 24
        a = 0.8 + t * 2.6
        z = 0.3 + t * 7.0
        rr = 1.52 - t * 0.62
        lean = 0.22 * (z / 7.6) ** 1.4
        va.append(bm.verts.new((lean + rr * math.cos(a), lean * 0.5 + rr * math.sin(a), z)))
        vb.append(bm.verts.new((lean + rr * math.cos(a + 0.05), lean * 0.5 + rr * math.sin(a + 0.05), z + 0.05)))
    loft(bm, [va, vb])
    rnd = random.Random(71)
    for i in range(7):
        a = i / 7 * 2 * math.pi + rnd.uniform(-0.2, 0.2)
        rr = rnd.uniform(1.6, 2.6)
        blob(bm, rr * math.cos(a) + 0.2, rr * math.sin(a) + 0.1, rnd.uniform(6.6, 7.3), 0.09, seed=80 + i)
    parts.append(obj_from_bm('GreatTree_Glow', bm, [GLOW]))

    coll = bpy.data.collections.new('Pandora_GreatTree')
    bpy.context.scene.collection.children.link(coll)
    coll['export_offset'] = [0, 0, 0]
    for ob in parts:
        for c in list(ob.users_collection): c.objects.unlink(ob)
        coll.objects.link(ob)

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print('FREETREE_OK %.1f KB' % (os.path.getsize(OUT_GLB) / 1024))
except Exception:
    print('FREETREE_FAIL: ' + traceback.format_exc()[-1600:])
