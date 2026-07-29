# build_canopy.py — authors the Verdant Maw's Pandora canopy GLBs.
# Run inside Blender (via the blender-mcp socket: exec this file).
#
# MIRRORS js/scene/zones/VerdantMaw/canopy.js — if a number changes there,
# change it here and re-export, or the visible ramp and the walkable ramp
# drift apart:
#   HELIX  rMid 4.15  halfW 0.95(visual)  th0 0.75pi  th1 pi/2+2.5pi  y0 0  y1 7.2
#          (th0 moved pi/2 -> 0.75pi 2026-07-27: the entrance belongs on the
#           SW approach line — owner flow note; th1/junction unchanged)
#   PAD    walkable r 4.0 (visual rim >= 4.05 everywhere)  BRIDGE nativeLen 4
#
# Conventions (CLAUDE.md): game (x, z) = Blender (x, -y); heights on Blender Z.
# Node colors are LINEAR — hex palette converted through the sRGB EOTF.
# Glow materials are named *Glow*/*Spirit* so Environment._applyRevealShading
# leaves them emissive.

import bpy, bmesh, math, random, os

OUT_DIR = r'D:\1Under1OverToo\models'

# ── canopy.js mirror ──────────────────────────────────────────────────────────
RMID, HALFW = 4.15, 0.95
TH0, TH1 = math.pi * 0.75, math.pi / 2 + 2.5 * math.pi
Y1 = 7.2
# Blender-space unit direction from the trunk to the ramp foot — the apron,
# gateposts and crown prune all follow it, so moving th0 moves the whole
# entrance ensemble together.
FOOT_DX, FOOT_DY = math.cos(TH0), -math.sin(TH0)

def lin(hexstr):
    """sRGB hex -> linear RGBA tuple for node color inputs."""
    v = [int(hexstr[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in v) + (1.0,)

def mat(name, hexstr, emissive=None, strength=1.6):
    m = bpy.data.materials.get(name)
    if m: return m
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

MAT_BARK   = lambda: mat('HometreeBark', '3a2b44')
MAT_MOSS   = lambda: mat('CanopyMoss', '2e5f4a')
MAT_LEAF   = lambda: mat('CanopyLeaf', '1e4a3c')
MAT_LEAF2  = lambda: mat('CanopyLeafViolet', '5a3f7a')
MAT_GLOW   = lambda: mat('HometreeGlow', '103830', emissive='7fffd8', strength=2.2)
MAT_PGLOW  = lambda: mat('PadGlow', '0f3028', emissive='66e8c8', strength=2.0)
MAT_SBARK  = lambda: mat('SpiritBark', 'cfc2dd')
MAT_SGLOW  = lambda: mat('SpiritGlow', '3d2438', emissive='ffc8ec', strength=2.6)

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
    """Bridge consecutive vertex rings (equal lengths) into quads."""
    made = []
    for a, b in zip(rings, rings[1:]):
        n = len(a)
        for i in range(n):
            f = bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
            f.material_index = mat_index
            made.append(f)
    if close_bottom:
        f = bm.faces.new(tuple(reversed(rings[0]))); f.material_index = mat_index
    if close_top:
        f = bm.faces.new(rings[-1]); f.material_index = mat_index
    return made

def ring(bm, cx, cy, z, r, n=16, wob=0.0, seed=0):
    rnd = random.Random(seed)
    pts = []
    ph = rnd.uniform(0, 6.28)
    for i in range(n):
        a = i / n * 2 * math.pi
        rr = r * (1 + wob * math.sin(3 * a + ph) * 0.5 + wob * math.sin(5 * a + ph * 1.7) * 0.5)
        pts.append(bm.verts.new((cx + rr * math.cos(a), cy + rr * math.sin(a), z)))
    return pts

def blob(bm, cx, cy, cz, r, sx=1.0, sy=1.0, sz=1.0, seed=0, mat_index=0):
    """Deformed icosphere blob appended into bm."""
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
    for f in bm.faces:
        if f.material_index == 0 and mat_index and all((abs(v.co.x - cx) < r * 2.4 and abs(v.co.y - cy) < r * 2.4 and abs(v.co.z - cz) < r * 2.4) for v in f.verts):
            f.material_index = mat_index

def tube(bm, p0, p1, r=0.1, n=8, mat_index=0):
    """Straight cylinder between two points."""
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
    loft(bm, rings, close_top=True, close_bottom=True, mat_index=mat_index)

def export(name, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    path = os.path.join(OUT_DIR, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True)
    dims = [0, 0, 0]
    for o in objects:
        for c in [o.matrix_world @ v.co for v in o.data.vertices]:
            dims[0] = max(dims[0], abs(c.x)); dims[1] = max(dims[1], abs(c.y)); dims[2] = max(dims[2], c.z)
    return {'file': name + '.glb', 'kb': round(os.path.getsize(path) / 1024, 1),
            'reachXY': [round(dims[0], 2), round(dims[1], 2)], 'topZ': round(dims[2], 2)}

# game height along the helix at unwrapped angle th
def hy(th): return (th - TH0) / (TH1 - TH0) * Y1
# game (x,z) -> Blender (x,-y): helix point in Blender space
def hpt(th, r, z): return (r * math.cos(th), -r * math.sin(th), z)

# ── 1. Hometree ───────────────────────────────────────────────────────────────
def build_hometree():
    parts = []
    # Trunk — lofted rings, flared base, bark wobble
    bm = bmesh.new()
    prof = [(0.0, 3.55), (0.7, 3.3), (1.6, 3.05), (3.2, 2.75), (5.0, 2.5), (7.2, 2.3), (8.6, 2.15), (9.7, 2.05)]
    rings_ = [ring(bm, 0, 0, z, r, n=16, wob=0.07, seed=int(z * 10)) for z, r in prof]
    loft(bm, rings_, close_top=True, close_bottom=True)
    # Buttress roots — six lobes half-sunk at the flare
    for i in range(6):
        a = i / 6 * 2 * math.pi + 0.3
        blob(bm, 3.4 * math.cos(a), 3.4 * math.sin(a), 0.12, 0.85, sx=1.5, sy=0.7, sz=0.55, seed=i)
    parts.append(obj_from_bm('Hometree_Trunk', bm, [MAT_BARK()]))

    # Helical ramp — closed strip: top(moss) / sides+bottom(bark), exact helix
    bm = bmesh.new()
    N = 110
    rows_ti, rows_to, rows_bo, rows_bi = [], [], [], []
    for i in range(N + 1):
        th = TH0 + (TH1 - TH0) * i / N
        z = hy(th)
        rows_ti.append(bm.verts.new(hpt(th, 3.05, z)))
        rows_to.append(bm.verts.new(hpt(th, 5.35, z)))
        rows_bo.append(bm.verts.new(hpt(th, 5.15, z - 0.42)))
        rows_bi.append(bm.verts.new(hpt(th, 3.05, z - 0.42)))
    for i in range(N):
        f = bm.faces.new((rows_ti[i], rows_to[i], rows_to[i + 1], rows_ti[i + 1])); f.material_index = 1  # moss top
        for a, b in ((rows_to, rows_bo), (rows_bo, rows_bi), (rows_bi, rows_ti)):
            bm.faces.new((a[i], b[i], b[i + 1], a[i + 1]))
    for rows in ((rows_ti, rows_to, rows_bo, rows_bi),):
        bm.faces.new((rows[0][0], rows[1][0], rows[2][0], rows[3][0]))
        bm.faces.new(tuple(reversed((rows[0][N], rows[1][N], rows[2][N], rows[3][N]))))
    # Struts to the trunk every ~0.45 rad
    th = TH0 + 0.5
    while th < TH1 - 0.2:
        z = hy(th)
        tube(bm, hpt(th, 4.15, z - 0.42), hpt(th, 2.45, z - 1.5), r=0.13)
        th += 0.45
    parts.append(obj_from_bm('Hometree_Ramp', bm, [MAT_BARK(), MAT_MOSS()]))

    # Crown — foliage blobs well above the junction's head clearance. The
    # sector over the ramp's ENTRANCE (now the SW face — FOOT_DX/DY) is
    # deliberately pruned open: crown mass there hung directly over the
    # approach and buried it from the fixed 46° camera (owner note). The
    # approach keeps open sky from the ground to the first quarter-turn.
    bm = bmesh.new()
    rnd = random.Random(7)
    for i in range(8):
        a = i / 8 * 2 * math.pi + rnd.uniform(0, 0.5)
        rr = rnd.uniform(3.2, 5.8)
        h = rnd.uniform(10.4, 12.4)
        r = rnd.uniform(2.0, 3.0)
        if math.cos(a) * FOOT_DX + math.sin(a) * FOOT_DY > 0.45:
            continue  # entrance-sector overhang — skip, keep the doorway open
        blob(bm, rr * math.cos(a), rr * math.sin(a), h, r, sx=1.25, sy=1.25, sz=0.8, seed=i + 20)
    blob(bm, -1.2, 3.6, 11.4, 2.6, sx=1.3, sy=1.25, sz=0.8, seed=27)  # north mass balance
    blob(bm, 0, 0.6, 12.9, 2.6, sx=1.3, sy=1.3, sz=0.9, seed=42)
    crown = obj_from_bm('Hometree_Crown', bm, [MAT_LEAF()])
    bm = bmesh.new()
    blob(bm, 4.6, 2.4, 11.2, 1.5, sx=1.2, sy=1.2, sz=0.8, seed=61)
    blob(bm, -4.6, 2.4, 11.6, 1.3, sx=1.2, sy=1.2, sz=0.8, seed=62)
    parts.append(obj_from_bm('Hometree_CrownAccent', bm, [MAT_LEAF2()]))
    parts.append(crown)

    # Entrance framing — the ramp foot reads as a doorway now: a root apron
    # fans out where the worn trail arrives, and two luminous waymarker
    # spires flank the mouth of the climb. Everything is placed along the
    # foot direction (FOOT_DX/DY) so it moves with th0.
    pdx, pdy = -FOOT_DY, FOOT_DX  # perpendicular to the approach line
    ax, ay = 5.15 * FOOT_DX, 5.15 * FOOT_DY
    bm = bmesh.new()
    top = ring(bm, ax, ay, 0.07, 1.45, n=12, wob=0.08, seed=13)
    under = ring(bm, ax, ay, 0.0, 1.75, n=12, wob=0.08, seed=14)
    center = bm.verts.new((ax, ay, 0.07))
    for i in range(12):
        f = bm.faces.new((center, top[i], top[(i + 1) % 12])); f.material_index = 1
    loft(bm, [top, under])
    parts.append(obj_from_bm('Hometree_EntranceApron', bm, [MAT_BARK(), MAT_MOSS()]))
    bm = bmesh.new()
    for s in (-1.7, 1.7):
        base = ring(bm, 5.30 * FOOT_DX + s * pdx,        5.30 * FOOT_DY + s * pdy,        0.0, 0.2,   n=8)
        mid  = ring(bm, 5.42 * FOOT_DX + s * 1.02 * pdx, 5.42 * FOOT_DY + s * 1.02 * pdy, 0.9, 0.13,  n=8)
        tip  = ring(bm, 5.55 * FOOT_DX + s * 1.05 * pdx, 5.55 * FOOT_DY + s * 1.05 * pdy, 1.8, 0.045, n=8)
        loft(bm, [base, mid, tip], close_top=True, close_bottom=True)
    parts.append(obj_from_bm('Hometree_EntranceGlow', bm, [MAT_GLOW()]))

    # Junction ledge — the visible platform under canopy.js's JUNCTION disc
    # (game x 7.5, z -19 → trunk-relative Blender (-5.5, 0), top at Z 7.2).
    # Slightly larger than the walkable r 1.9 so feet never overhang.
    bm = bmesh.new()
    jx, jy = -5.5, 0.0
    top = ring(bm, jx, jy, 7.2, 2.1, n=16, wob=0.05, seed=9)
    under = ring(bm, jx, jy, 6.72, 1.5, n=16, wob=0.06, seed=10)
    tail = ring(bm, jx * 0.62, jy, 6.2, 0.75, n=16, seed=11)  # tapers back toward the trunk
    center = bm.verts.new((jx, jy, 7.2))
    for i in range(16):
        f = bm.faces.new((center, top[i], top[(i + 1) % 16])); f.material_index = 1
    loft(bm, [top, under, tail], close_bottom=True)
    tube(bm, (jx * 0.62, jy, 6.2), (-2.1, 0, 5.3), r=0.42)  # support branch into the trunk
    parts.append(obj_from_bm('Hometree_Junction', bm, [MAT_BARK(), MAT_MOSS()]))

    # Glow — outer-lip spiral ribbon + three trunk veins
    bm = bmesh.new()
    ra, rb = [], []
    for i in range(N + 1):
        th = TH0 + (TH1 - TH0) * i / N
        z = hy(th) + 0.02
        ra.append(bm.verts.new(hpt(th, 5.18, z)))
        rb.append(bm.verts.new(hpt(th, 5.34, z)))
    loft(bm, [ra, rb])
    for k in range(3):
        base = k / 3 * 2 * math.pi
        va, vb = [], []
        for i in range(25):
            t = i / 24
            a = base + t * 1.8
            z = 0.4 + t * 7.6
            rr = 3.62 - t * 1.28  # hugs the tapering trunk, proud of the bark
            va.append(bm.verts.new((rr * math.cos(a), -rr * math.sin(a), z)))
            vb.append(bm.verts.new(((rr) * math.cos(a + 0.045), -(rr) * math.sin(a + 0.045), z + 0.05)))
        loft(bm, [va, vb])
    parts.append(obj_from_bm('Hometree_Glow', bm, [MAT_GLOW()]))
    return export('Pandora_Hometree', parts)

# ── 2. Canopy pad ─────────────────────────────────────────────────────────────
def build_canopy_pad():
    parts = []
    bm = bmesh.new()
    # Platform: flat top at Z 0 (the resolver's line), rim >= 4.05 everywhere
    top = ring(bm, 0, 0, 0.0, 4.3, n=22, wob=0.055, seed=3)
    under = ring(bm, 0, 0, -0.55, 3.55, n=22, wob=0.05, seed=4)
    taper = ring(bm, 0, 0, -2.3, 1.0, n=22, seed=5)
    stem_a = ring(bm, 0, 0, -6.0, 0.8, n=22, wob=0.1, seed=6)
    stem_b = ring(bm, 0, 0, -11.0, 0.95, n=22, wob=0.1, seed=7)
    center = bm.verts.new((0, 0, 0.0))
    for i in range(22):
        f = bm.faces.new((center, top[i], top[(i + 1) % 22])); f.material_index = 1  # moss top
    loft(bm, [top, under, taper, stem_a, stem_b], close_bottom=True)
    # Leaf clumps crowning the support tree, just under the rim
    rnd = random.Random(11)
    for i in range(5):
        a = i / 5 * 2 * math.pi + 0.4
        blob(bm, 4.35 * math.cos(a), 4.35 * math.sin(a), -0.32, rnd.uniform(0.8, 1.2),
             sx=1.3, sy=1.0, sz=0.5, seed=30 + i, mat_index=2)
    parts.append(obj_from_bm('CanopyPad_Body', bm, [MAT_BARK(), MAT_MOSS(), MAT_LEAF()]))
    # Rim glow ring
    bm = bmesh.new()
    ra = ring(bm, 0, 0, 0.025, 3.98, n=30)
    rb = ring(bm, 0, 0, 0.025, 4.14, n=30)
    loft(bm, [ra, rb])
    parts.append(obj_from_bm('CanopyPad_Glow', bm, [MAT_PGLOW()]))
    return export('Pandora_CanopyPad', parts)

# ── 3. Branch bridge — native length 4 on +X, walk-top sagging just under Z 0 ─
def build_branch_bridge():
    parts = []
    bm = bmesh.new()
    N = 13
    secs = []
    for i in range(N + 1):
        x = -2 + 4 * i / N
        cz = -0.20 - 0.10 * math.cos(math.pi * x / 4)   # gentle sag, ends at -0.20-0=-0.20? cos(±pi/2)=0 → -0.20; mid -0.30
        w = 1.0 + 0.06 * math.cos(math.pi * x / 4)
        sec = []
        for j, (yy, zz) in enumerate(((-w, cz), (-w * 0.8, cz + 0.18), (w * 0.8, cz + 0.18), (w, cz),
                                      (w * 0.72, cz - 0.28), (-w * 0.72, cz - 0.28))):
            sec.append(bm.verts.new((x, yy, zz)))
        secs.append(sec)
    for i in range(N):
        n = 6
        for j in range(n):
            f = bm.faces.new((secs[i][j], secs[i][(j + 1) % n], secs[i + 1][(j + 1) % n], secs[i + 1][j]))
            if j == 1: f.material_index = 1  # walk-top strip = moss
    bm.faces.new(tuple(reversed(secs[0])))
    bm.faces.new(tuple(secs[N]))
    # Twig rails outside the walkable band
    for side in (-1, 1):
        prev = None
        for i in range(9):
            x = -1.9 + 3.8 * i / 8
            cz = -0.20 - 0.10 * math.cos(math.pi * x / 4)
            p = (x, side * 0.97, cz + 0.42)
            if prev: tube(bm, prev, p, r=0.045, n=6)
            if i % 3 == 0: tube(bm, (x, side * 0.92, cz + 0.14), p, r=0.04, n=6)
            prev = p
    parts.append(obj_from_bm('BranchBridge_Body', bm, [MAT_BARK(), MAT_MOSS()]))
    # Glow moss dots on the rails
    bm = bmesh.new()
    rnd = random.Random(17)
    for i in range(6):
        x = rnd.uniform(-1.8, 1.8); side = 1 if i % 2 else -1
        cz = -0.20 - 0.10 * math.cos(math.pi * x / 4)
        blob(bm, x, side * 0.97, cz + 0.44, 0.07, seed=50 + i)
    parts.append(obj_from_bm('BranchBridge_Glow', bm, [MAT_PGLOW()]))
    return export('Pandora_BranchBridge', parts)

# ── 3b. Long branch bridge — native length 8 on +X, for loop spans > 5 ───────
# Deeper sag than the short one, plus hanging vine tendrils with glow tips so
# a long crossing reads alive rather than stretched.
def build_branch_bridge_long():
    parts = []
    bm = bmesh.new()
    N = 22
    secs = []
    for i in range(N + 1):
        x = -4 + 8 * i / N
        cz = -0.22 - 0.16 * math.cos(math.pi * x / 8)
        w = 1.05 + 0.07 * math.cos(math.pi * x / 8)
        sec = []
        for (yy, zz) in ((-w, cz), (-w * 0.8, cz + 0.18), (w * 0.8, cz + 0.18), (w, cz),
                         (w * 0.72, cz - 0.30), (-w * 0.72, cz - 0.30)):
            sec.append(bm.verts.new((x, yy, zz)))
        secs.append(sec)
    for i in range(N):
        n = 6
        for j in range(n):
            f = bm.faces.new((secs[i][j], secs[i][(j + 1) % n], secs[i + 1][(j + 1) % n], secs[i + 1][j]))
            if j == 1: f.material_index = 1
    bm.faces.new(tuple(reversed(secs[0])))
    bm.faces.new(tuple(secs[N]))
    for side in (-1, 1):
        prev = None
        for i in range(15):
            x = -3.8 + 7.6 * i / 14
            cz = -0.22 - 0.16 * math.cos(math.pi * x / 8)
            p = (x, side * 1.0, cz + 0.42)
            if prev: tube(bm, prev, p, r=0.045, n=6)
            if i % 3 == 0: tube(bm, (x, side * 0.95, cz + 0.14), p, r=0.04, n=6)
            prev = p
    # Hanging vine tendrils under the span
    rnd = random.Random(29)
    for i in range(4):
        x = rnd.uniform(-3.0, 3.0); side = rnd.choice((-1, 1))
        cz = -0.22 - 0.16 * math.cos(math.pi * x / 8)
        drop = rnd.uniform(0.8, 1.6)
        tube(bm, (x, side * 0.85, cz - 0.28), (x + rnd.uniform(-0.2, 0.2), side * 0.95, cz - 0.28 - drop), r=0.035, n=5)
    parts.append(obj_from_bm('BranchBridgeLong_Body', bm, [MAT_BARK(), MAT_MOSS()]))
    bm = bmesh.new()
    rnd = random.Random(31)
    for i in range(7):
        x = rnd.uniform(-3.6, 3.6); side = 1 if i % 2 else -1
        cz = -0.22 - 0.16 * math.cos(math.pi * x / 8)
        blob(bm, x, side * 1.0, cz + 0.44, 0.07, seed=70 + i)
    # glow tips on the tendril ends
    for i in range(4):
        x = -3.0 + 2.0 * i
        cz = -0.22 - 0.16 * math.cos(math.pi * x / 8)
        blob(bm, x, 0.9 if i % 2 else -0.9, cz - 1.35, 0.06, seed=80 + i)
    parts.append(obj_from_bm('BranchBridgeLong_Glow', bm, [MAT_PGLOW()]))
    return export('Pandora_BranchBridgeLong', parts)

# ── 4. Spirit tree — pale weeping form, glow strands ─────────────────────────
def build_spirit_tree():
    parts = []
    bm = bmesh.new()
    prof = [(0.0, 0.34), (0.7, 0.26), (1.5, 0.21), (2.2, 0.17), (2.9, 0.14)]
    rings_ = []
    for z, r in prof:
        sway = 0.14 * math.sin(z * 1.4)
        rings_.append(ring(bm, sway, 0, z, r, n=10, wob=0.08, seed=int(z * 9)))
    loft(bm, rings_, close_top=True, close_bottom=True)
    for i in range(3):  # short arms
        a = i / 3 * 2 * math.pi + 0.5
        tube(bm, (0.1, 0, 2.75), (0.75 * math.cos(a), 0.75 * math.sin(a), 3.25), r=0.07)
    blob(bm, 0.05, 0, 3.15, 0.3, seed=71)
    parts.append(obj_from_bm('SpiritTree_Trunk', bm, [MAT_SBARK()]))
    # Weeping glow strands
    bm = bmesh.new()
    rnd = random.Random(23)
    for i in range(26):
        a = i / 26 * 2 * math.pi + rnd.uniform(-0.1, 0.1)
        r0 = rnd.uniform(0.15, 0.45); r1 = rnd.uniform(1.1, 1.85)
        z0 = rnd.uniform(2.7, 3.3); z1 = rnd.uniform(0.45, 1.2)
        segs = 7; prev = None
        for j in range(segs + 1):
            t = j / segs
            rr = r0 + (r1 - r0) * (t ** 0.8)
            zz = z0 + (z1 - z0) * (t ** 1.3)
            p = (rr * math.cos(a), rr * math.sin(a), zz)
            if prev: tube(bm, prev, p, r=0.028, n=5)
            prev = p
    parts.append(obj_from_bm('SpiritTree_Strands', bm, [MAT_SGLOW()]))
    return export('Pandora_SpiritTree', parts)

# ── run ───────────────────────────────────────────────────────────────────────
clear_scene()
results = []
# Each asset exports at the origin (GLBs identical run to run), then moves
# aside into its own collection so the whole set survives as one openable
# .blend source — the repo's Assets/3D convention.
OFFSET = 0
# NOTE: the branch bridges AND canopy pads were superseded by Rodin-based
# versions living in PandoraBridges.blend / PandoraPads.blend (owner quality
# notes, 2026-07-26) — their builder functions stay above for reference but
# are NOT in the runner, so a bootstrap re-run can never clobber the shipped
# GLBs.
for fn in (build_hometree, build_spirit_tree):
    before = set(bpy.data.objects)
    results.append(fn())
    coll = bpy.data.collections.new(fn.__name__.replace('build_', ''))
    bpy.context.scene.collection.children.link(coll)
    for o in [o for o in bpy.data.objects if o not in before]:
        o.location.x += OFFSET
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
    OFFSET += 24
bpy.ops.wm.save_as_mainfile(filepath=r'D:\1Under1OverToo\Assets\3D\VerdantMaw\Canopy.blend')
print('CANOPY_BUILD_RESULTS=' + repr(results))
