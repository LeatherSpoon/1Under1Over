# build_spire.py — the Root Spire v2: the River Expanse's climbable ramp tower.
# v2 (owner round): the trunk is now a RODIN sculpt (twisted-root tower,
# rodin_rootspire_raw.glb, task 6fbda85c 2026-07-27) instead of a flat lofted
# column, and the helical ledge WIDENED for descent feel — the walk band grew
# 0.85 → 1.05 half-width and the visual moss band now encloses it on both
# sides (walkable 1.30..3.40 inside visual 1.25..3.45).
#
# MIRRORS js/scene/zones/VerdantMaw/canopy.js SPIRE — change a number there,
# change it here and re-export, or the visible ledge and the walkable helix
# drift apart:
#   SPIRE  rMid 2.35  halfW 1.05(walk)  topR 2.3(walk)  topY 7.0
#   th0 pi/2 (south foot)  th1 pi/2 + 2.5pi — placements keep rotY 0/scale 1.
#
# Run headless:  blender -b --python build_spire.py
# Outputs models/Pandora_RootSpire.glb; source RootSpire.blend (watched).
import bpy, bmesh, math, random, os, sys, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rodin_process as rp

RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rodin_rootspire_raw.glb')
OUT_GLB = r'D:\1Under1OverToo\models\Pandora_RootSpire.glb'
OUT_BLEND = r'D:\1Under1OverToo\Assets\3D\VerdantMaw\RootSpire.blend'
RENDER = r'C:\Users\Owner\AppData\Local\Temp\claude\D--1Under1OverToo\b5e6352a-c5fb-4c1f-81c3-c15da474a36b\scratchpad\spire2_check.png'

RMID = 2.35
LEDGE_IN, LEDGE_OUT = 1.25, 3.45          # visual moss band (walk 1.30..3.40)
TH0, TH1 = math.pi / 2, math.pi / 2 + 2.5 * math.pi
TOPY = 7.0
TRUNK_H = 6.95                            # Rodin trunk peaks just under the crown

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
        n = 1 + 0.16 * math.sin(v.co.x * 3.1 + rnd.random()) * math.sin(v.co.z * 2.7)
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

# game height along the spire helix; game (x,z) -> Blender (x,-y)
def hy(th): return (th - TH0) / (TH1 - TH0) * TOPY
def hpt(th, r, z): return (r * math.cos(th), -r * math.sin(th), z)

try:
    bpy.ops.wm.read_homefile(use_empty=True)

    # ── Trunk: the Rodin twisted-root tower, normalized to the spire's spine ─
    trunk = rp.join_parts(rp.import_raw(RAW))
    img = rp.find_diffuse(trunk)
    rp.collapse_material(trunk, 'SpireTrunkBody', img)
    rp.orient_upright(trunk)
    rp.normalize(trunk, TRUNK_H)
    # clamp footprint: the ledge band starts at r 1.25 — squeeze XY so the
    # trunk's widest point stays ≤ ~2.0 (roots may flare past the ledge's
    # inner edge; the band is cut into them visually, which reads fine)
    vs = trunk.data.vertices
    max_r = max(math.hypot(v.co.x, v.co.y) for v in vs)
    if max_r > 2.0:
        s = 2.0 / max_r
        for v in vs:
            v.co.x *= s; v.co.y *= s
    tris = rp.decimate(trunk, 15000)
    trunk.name = 'RootSpire_Trunk'

    BARK = mat('SpireBark', '3a2b44')
    MOSS = mat('SpireMoss', '2e5f4a')
    LEAF = mat('SpireLeaf', '1e4a3c')
    GLOW = mat('SpireGlow', '103830', emissive='7fffd8', strength=2.2)

    parts = [trunk]
    # ── Helical ledge — moss top exactly on the walk line hy(th) ─────────────
    bm = bmesh.new()
    N = 80
    rows_ti, rows_to, rows_bo, rows_bi = [], [], [], []
    for i in range(N + 1):
        th = TH0 + (TH1 - TH0) * i / N
        z = hy(th)
        rows_ti.append(bm.verts.new(hpt(th, LEDGE_IN, z)))
        rows_to.append(bm.verts.new(hpt(th, LEDGE_OUT, z)))
        rows_bo.append(bm.verts.new(hpt(th, LEDGE_OUT - 0.15, z - 0.42)))
        rows_bi.append(bm.verts.new(hpt(th, LEDGE_IN, z - 0.42)))
    for i in range(N):
        f = bm.faces.new((rows_ti[i], rows_to[i], rows_to[i + 1], rows_ti[i + 1])); f.material_index = 1
        for a, b in ((rows_to, rows_bo), (rows_bo, rows_bi), (rows_bi, rows_ti)):
            bm.faces.new((a[i], b[i], b[i + 1], a[i + 1]))
    for rows in ((rows_ti, rows_to, rows_bo, rows_bi),):
        bm.faces.new((rows[0][0], rows[1][0], rows[2][0], rows[3][0]))
        bm.faces.new(tuple(reversed((rows[0][N], rows[1][N], rows[2][N], rows[3][N]))))
    th = TH0 + 0.5
    while th < TH1 - 0.2:
        z = hy(th)
        tube(bm, hpt(th, RMID, z - 0.4), hpt(th, 1.3, z - 1.3), r=0.11)
        th += 0.5
    parts.append(obj_from_bm('RootSpire_Ledge', bm, [BARK, MOSS]))

    # ── Crown platform — broad mossy cap at TOPY covering the helix exit ─────
    bm = bmesh.new()
    top = ring(bm, 0, 0, TOPY, 2.6, n=18, wob=0.06, seed=8)
    under = ring(bm, 0, 0, TOPY - 0.42, 1.9, n=18, wob=0.05, seed=9)
    neck = ring(bm, 0, 0, TOPY - 0.9, 1.5, n=18, seed=10)
    center = bm.verts.new((0, 0, TOPY))
    for i in range(18):
        f = bm.faces.new((center, top[i], top[(i + 1) % 18])); f.material_index = 1
    loft(bm, [top, under, neck])
    parts.append(obj_from_bm('RootSpire_Crown', bm, [BARK, MOSS]))

    # Leaf tufts around the crown rim
    bm = bmesh.new()
    rnd = random.Random(31)
    for i in range(4):
        a = i / 4 * 2 * math.pi + rnd.uniform(0, 0.6)
        blob(bm, 2.35 * math.cos(a), 2.35 * math.sin(a), TOPY + 0.22, rnd.uniform(0.55, 0.75),
             sx=1.25, sy=1.25, sz=0.6, seed=60 + i)
    parts.append(obj_from_bm('RootSpire_Tufts', bm, [LEAF]))

    # ── Glow — the climbable signal: outer-lip spiral on the new band edge ───
    bm = bmesh.new()
    ra, rb = [], []
    for i in range(N + 1):
        th = TH0 + (TH1 - TH0) * i / N
        z = hy(th) + 0.02
        ra.append(bm.verts.new(hpt(th, LEDGE_OUT - 0.17, z)))
        rb.append(bm.verts.new(hpt(th, LEDGE_OUT - 0.02, z)))
    for i in range(N):  # OPEN strip — loft's modulo wrap would bridge the spiral's ends
        bm.faces.new((ra[i], ra[i + 1], rb[i + 1], rb[i]))
    parts.append(obj_from_bm('RootSpire_Glow', bm, [GLOW]))

    rp.export_collection('Pandora_RootSpire', parts, OUT_GLB, OUT_BLEND)
    rp.check_render(parts, RENDER, look_z=3.4)
    print('SPIRE2_OK %.1f KB  trunkTris=%d' % (os.path.getsize(OUT_GLB) / 1024, tris))
except Exception:
    print('SPIRE2_FAIL: ' + traceback.format_exc()[-1600:])
