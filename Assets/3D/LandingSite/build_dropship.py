# build_dropship.py — authors Landing_Dropship.glb, the ship the player lands in.
#
#   blender -b --factory-startup --python Assets/3D/LandingSite/build_dropship.py
#
# BRIEF (owner): "a Star Trek class ship mixed with a C130", explicitly NOT the
# Enterprise or any recognisable Star Trek ship, and the player walks in through
# the REAR of the ship because the cargo bay is down.
#
# THE DESIGN — an original atmospheric heavy lifter. The airframe is the C-130
# half and carries the silhouette: high straight shoulder wings, a fat slab-
# sided cargo fuselage with a flat deck, sponson blisters on the flanks, and the
# signature upswept tail boom that exists precisely so a rear ramp can drop to
# the ground. The Trek half is the propulsion and the glass: warp pods sit in
# the four turboprop stations under the wings, glowing at the intake ring and
# along an outboard grille, a deflector dish is recessed low in the nose, and
# the flight deck is a wraparound canopy.
#
# Deliberately avoided so it reads as its own ship: no saucer section, no
# secondary hull on a neck, and no pair of cylindrical nacelles on swept pylons
# standing off the spine. Putting the pods where an engine goes on a cargo plane
# is the whole idea — it reads as a freighter that happens to go FTL.
#
# Palette matches the interior shell the player steps into (SpaceshipShell.glb:
# cream panels, teal trim, brass inlay) so outside and inside are one ship.
#
# CONVENTIONS. Game (x, z) = Blender (x, -y); heights on Blender Z. The nose
# points toward game +z (blender -y) per the station-GLB convention, so the
# ramp descends toward game -z and the ship is placed with its tail turned to
# the landing pad. Authored at TRUE WORLD SCALE (player is 1.78 tall) so the
# ZoneAssets placement uses scale 1.0. Grounded: the gear and the ramp foot
# touch z = 0.
#
# Colour inputs are converted sRGB -> linear before assignment: Blender node
# default_value is linear and a raw hex reads ~1.5 stops too bright in-engine.

import bpy, bmesh, math, os, random

OUT_DIR = r'D:\1Under1OverToo\models'
BLEND = r'D:\1Under1OverToo\Assets\3D\LandingSite\Dropship.blend'

# ── Airframe dimensions (world units) ────────────────────────────────────────
FUS_LEN = 12.0          # nose to the tail-boom root
FUS_W, FUS_H = 3.30, 3.05
DECK_Z = 1.62           # cargo floor height — the ramp descends from here
NOSE_Y = -FUS_LEN * 0.5  # blender -y is game +z (forward)
TAIL_Y = FUS_LEN * 0.5
RAMP_LEN = 3.30
WING_SPAN = 15.2
WING_Z = 3.55           # shoulder-mounted, above the cargo box
POD_X = 4.15            # warp pods in the outboard engine station
FIN_Z = 7.10

HULL, TEAL, TRIM = 'd8d2c6', '2e7d74', '39424a'
BRASS, GLASS = 'b58f4a', '243d47'
GLOW_C, GLOW_W = '7fe9dd', 'ffcf8a'


def lin(h):
    v = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in v) + (1.0,)


def mat(name, hexstr, emit=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = lin(hexstr)
    b.inputs['Roughness'].default_value = 0.85 if emit == 0 else 1.0
    if emit > 0:
        b.inputs['Emission Color'].default_value = lin(hexstr)
        b.inputs['Emission Strength'].default_value = emit
    m.use_backface_culling = True
    return m


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def obj_from_bm(name, bm, mats):
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    for m in mats:
        ob.data.materials.append(m)
    bpy.context.collection.objects.link(ob)
    return ob


def loft(bm, rings, close_first=False, close_last=False, mi=0):
    for a, b in zip(rings, rings[1:]):
        n = len(a)
        for i in range(n):
            f = bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
            f.material_index = mi
    if close_first:
        f = bm.faces.new(tuple(reversed(rings[0]))); f.material_index = mi
    if close_last:
        f = bm.faces.new(rings[-1]); f.material_index = mi


def rounded_rect(bm, y, cz, w, h, r, n=24):
    """One fuselage cross-section: a rounded rectangle in the XZ plane at depth y.

    A rounded box (not a cylinder) is what makes it read as a cargo aircraft —
    slab flanks, flat belly for the deck, radiused corners.
    """
    pts = []
    hw, hh = max(w * 0.5 - r, 0.01), max(h * 0.5 - r, 0.01)
    for i in range(n):
        a = i / n * 2 * math.pi
        cx, cy = math.cos(a), math.sin(a)
        px = hw * (1 if cx > 0 else -1) + r * cx
        pz = hh * (1 if cy > 0 else -1) + r * cy
        # Blend toward the true rounded-rect corner so the section stays convex
        px = max(-w * 0.5, min(w * 0.5, px))
        pz = max(-h * 0.5, min(h * 0.5, pz))
        pts.append(bm.verts.new((px, y, cz + pz)))
    return pts


def box(bm, cx, cy, cz, sx, sy, sz, mi=0, rot=0.0):
    tmp = bmesh.new()
    bmesh.ops.create_cube(tmp, size=1.0)
    for v in tmp.verts:
        v.co.x *= sx; v.co.y *= sy; v.co.z *= sz
        if rot:
            y, z = v.co.y, v.co.z
            v.co.y = y * math.cos(rot) - z * math.sin(rot)
            v.co.z = y * math.sin(rot) + z * math.cos(rot)
        v.co.x += cx; v.co.y += cy; v.co.z += cz
    for f in tmp.faces:
        f.material_index = mi
    me = bpy.data.meshes.new('t'); tmp.to_mesh(me); tmp.free()
    bm.from_mesh(me); bpy.data.meshes.remove(me)


def cyl(bm, cx, cy, cz, r0, r1, length, axis='y', n=16, mi=0):
    tmp = bmesh.new()
    rings = []
    for k, rr in ((0, r0), (1, r1)):
        ring = []
        for i in range(n):
            a = i / n * 2 * math.pi
            u, v = rr * math.cos(a), rr * math.sin(a)
            d = (k - 0.5) * length
            co = (u, d, v) if axis == 'y' else ((d, u, v) if axis == 'x' else (u, v, d))
            ring.append(tmp.verts.new(co))
        rings.append(ring)
    loft(tmp, rings, close_first=True, close_last=True, mi=mi)
    bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
    for f in tmp.faces:
        f.material_index = mi
    for v in tmp.verts:
        v.co.x += cx; v.co.y += cy; v.co.z += cz
    me = bpy.data.meshes.new('t'); tmp.to_mesh(me); tmp.free()
    bm.from_mesh(me); bpy.data.meshes.remove(me)


clear()
parts = []
M_HULL, M_TEAL, M_TRIM = mat('Ship_Hull', HULL), mat('Ship_Teal', TEAL), mat('Ship_Trim', TRIM)
M_BRASS, M_GLASS = mat('Ship_Brass', BRASS), mat('Ship_Glass', GLASS)
M_GLOWC = mat('Ship_GlowCyan', GLOW_C, emit=3.2)
M_GLOWW = mat('Ship_GlowWarm', GLOW_W, emit=2.4)

# ── Fuselage ─────────────────────────────────────────────────────────────────
# Stations from nose to tail. The mid-body is constant section (the cargo box);
# the nose tapers and drops, the aft end lifts into the boom so the ramp has
# clear air behind it — that upsweep is the C-130 cue doing structural work.
bm = bmesh.new()
STATIONS = [
    # (y, centre z, width, height, corner r)
    (NOSE_Y - 0.10, DECK_Z + 1.05, 1.20, 1.30, 0.45),
    (NOSE_Y + 0.70, DECK_Z + 1.20, 2.35, 2.30, 0.60),
    (NOSE_Y + 1.90, DECK_Z + 1.30, 3.10, 2.90, 0.70),
    (NOSE_Y + 3.60, DECK_Z + 1.32, FUS_W, FUS_H, 0.72),
    (0.0,           DECK_Z + 1.32, FUS_W, FUS_H, 0.72),
    (TAIL_Y - 3.40, DECK_Z + 1.32, FUS_W, FUS_H, 0.72),
    (TAIL_Y - 1.70, DECK_Z + 1.55, 3.10, 2.80, 0.70),
    (TAIL_Y - 0.35, DECK_Z + 2.05, 2.60, 2.35, 0.62),
]
rings = [rounded_rect(bm, y, cz, w, h, r) for (y, cz, w, h, r) in STATIONS]
# Nose capped; tail left OPEN — that hole is the cargo door the player walks in.
loft(bm, rings, close_first=True, close_last=False)
parts.append(obj_from_bm('Dropship_Fuselage', bm, [M_HULL]))

# ── Tail boom + empennage ────────────────────────────────────────────────────
bm = bmesh.new()
boom = [
    (TAIL_Y - 0.60, DECK_Z + 3.05, 2.10, 1.25, 0.40),
    (TAIL_Y + 0.90, DECK_Z + 3.55, 1.70, 1.10, 0.36),
    (TAIL_Y + 2.10, DECK_Z + 4.05, 1.25, 0.90, 0.30),
]
loft(bm, [rounded_rect(bm, y, cz, w, h, r, n=16) for (y, cz, w, h, r) in boom],
     close_first=True, close_last=True)
parts.append(obj_from_bm('Dropship_Boom', bm, [M_HULL]))

# Vertical stabiliser (swept trailing edge) + tailplanes
bm = bmesh.new()
FIN_ROOT_Y, FIN_TIP_Y = TAIL_Y + 0.30, TAIL_Y + 2.35
fin = [
    [(-0.16, FIN_ROOT_Y - 1.30, DECK_Z + 3.90), (0.16, FIN_ROOT_Y - 1.30, DECK_Z + 3.90),
     (0.16, FIN_ROOT_Y + 1.75, DECK_Z + 3.90), (-0.16, FIN_ROOT_Y + 1.75, DECK_Z + 3.90)],
    [(-0.10, FIN_TIP_Y - 1.05, FIN_Z), (0.10, FIN_TIP_Y - 1.05, FIN_Z),
     (0.10, FIN_TIP_Y + 0.55, FIN_Z), (-0.10, FIN_TIP_Y + 0.55, FIN_Z)],
]
rings = [[bm.verts.new(p) for p in ring] for ring in fin]
loft(bm, rings, close_first=True, close_last=True)
for sx in (-1, 1):
    box(bm, sx * 1.75, TAIL_Y + 1.35, DECK_Z + 4.30, 3.10, 1.20, 0.20)
parts.append(obj_from_bm('Dropship_Tail', bm, [M_HULL]))

# ── Wings ────────────────────────────────────────────────────────────────────
# Straight, high-mounted, slight dihedral — the shoulder wing is what stops the
# silhouette reading as a fighter and starts it reading as a lifter.
bm = bmesh.new()
for sx in (-1, 1):
    root = [(sx * 1.55, -2.25, WING_Z - 0.22), (sx * 1.55, 1.95, WING_Z - 0.22),
            (sx * 1.55, 1.95, WING_Z + 0.30), (sx * 1.55, -2.25, WING_Z + 0.30)]
    tipx = sx * WING_SPAN * 0.5
    tip = [(tipx, -1.35, WING_Z + 0.62), (tipx, 1.30, WING_Z + 0.62),
           (tipx, 1.30, WING_Z + 0.86), (tipx, -1.35, WING_Z + 0.86)]
    rings = [[bm.verts.new(p) for p in r] for r in (root, tip)]
    loft(bm, rings, close_first=True, close_last=True)
    # Wingtip navigation strake
    box(bm, tipx * 1.02, -0.05, WING_Z + 0.74, 0.16, 2.50, 0.14, mi=1)
parts.append(obj_from_bm('Dropship_Wings', bm, [M_HULL, M_TRIM]))

# ── Warp pods ────────────────────────────────────────────────────────────────
# In the turboprop stations, on short pylons. Body + intake ring + outboard
# grille: the FTL half of the brief, worn like engines rather than like nacelles.
bm = bmesh.new()
bmg = bmesh.new()
for sx in (-1, 1):
    for j, px in enumerate((POD_X, POD_X + 2.55)):
        x = sx * px
        pylon_z = WING_Z + 0.30 - 0.55 * (0.35 if j else 0.0)
        box(bm, x, 0.30, WING_Z - 0.28, 0.42, 1.70, 0.95)          # pylon
        cyl(bm, x, -0.35, WING_Z - 1.05, 0.62, 0.70, 3.90)          # pod body
        cyl(bm, x, -2.34, WING_Z - 1.05, 0.50, 0.62, 0.20, mi=1)    # intake lip
        cyl(bmg, x, -2.44, WING_Z - 1.05, 0.44, 0.44, 0.10)         # intake glow
        # Outboard glow grille along the pod flank
        box(bmg, x + sx * 0.63, -0.45, WING_Z - 1.05, 0.06, 2.40, 0.26)
parts.append(obj_from_bm('Dropship_Pods', bm, [M_HULL, M_BRASS]))
parts.append(obj_from_bm('Dropship_PodGlow', bmg, [M_GLOWC]))

# ── Flight deck glazing + nose deflector ─────────────────────────────────────
bm = bmesh.new()
for i in range(5):
    a = (i / 4 - 0.5) * 1.85
    box(bm, math.sin(a) * 1.02, NOSE_Y + 0.62 - math.cos(a) * 0.30,
        DECK_Z + 1.72, 0.52, 0.10, 0.62, rot=-0.22)
parts.append(obj_from_bm('Dropship_Glass', bm, [M_GLASS]))

bm = bmesh.new()
cyl(bm, 0.0, NOSE_Y + 0.28, DECK_Z + 0.35, 0.46, 0.52, 0.16)
parts.append(obj_from_bm('Dropship_Deflector', bm, [M_GLOWW]))

# ── Sponsons, gear, hull banding ─────────────────────────────────────────────
bm = bmesh.new()
for sx in (-1, 1):
    box(bm, sx * (FUS_W * 0.5 + 0.16), 0.55, DECK_Z + 0.10, 0.62, 4.30, 1.05)   # sponson
parts.append(obj_from_bm('Dropship_Sponsons', bm, [M_TEAL]))

bm = bmesh.new()
GEAR = [(0.0, NOSE_Y + 1.35, 0.42), (-1.92, 1.40, 0.50), (1.92, 1.40, 0.50)]
for gx, gy, gr in GEAR:
    cyl(bm, gx, gy, DECK_Z * 0.5 - 0.10, 0.17, 0.20, DECK_Z + 0.20, axis='z', n=10)
    cyl(bm, gx, gy, gr * 0.52, gr, gr, 0.34, axis='x', n=12, mi=1)              # wheel/pad
parts.append(obj_from_bm('Dropship_Gear', bm, [M_TRIM, M_TRIM]))

# Teal band + brass inlay along the flanks, matching the interior shell
bm = bmesh.new()
for sx in (-1, 1):
    box(bm, sx * (FUS_W * 0.5 + 0.02), -0.60, DECK_Z + 2.42, 0.10, 8.20, 0.34, mi=0)
    box(bm, sx * (FUS_W * 0.5 + 0.03), -0.60, DECK_Z + 2.16, 0.10, 8.20, 0.09, mi=1)
parts.append(obj_from_bm('Dropship_Banding', bm, [M_TEAL, M_BRASS]))

# ── Cargo ramp + bay ─────────────────────────────────────────────────────────
# The walk-in. The ramp is DOWN (owner: "the cargo bay is down") — it hinges at
# the deck lip and its foot rests on the ground, so the player walks up it into
# the hold rather than through a portal standing on the grass.
bm = bmesh.new()
hinge_y, foot_y = TAIL_Y - 0.30, TAIL_Y - 0.30 + RAMP_LEN
rw = 1.15
ramp = [
    [(-rw, hinge_y, DECK_Z), (rw, hinge_y, DECK_Z),
     (rw, hinge_y, DECK_Z - 0.16), (-rw, hinge_y, DECK_Z - 0.16)],
    [(-rw, foot_y, 0.03), (rw, foot_y, 0.03),
     (rw, foot_y, -0.09), (-rw, foot_y, -0.09)],
]
rings = [[bm.verts.new(p) for p in r] for r in ramp]
loft(bm, rings, close_first=True, close_last=True)
# Grip cleats across the ramp
for i in range(6):
    t = (i + 0.6) / 6.4
    box(bm, 0.0, hinge_y + (foot_y - hinge_y) * t, DECK_Z + (0.03 - DECK_Z) * t + 0.055,
        rw * 1.86, 0.13, 0.05, mi=1, rot=-math.atan2(DECK_Z, RAMP_LEN))
parts.append(obj_from_bm('Dropship_Ramp', bm, [M_HULL, M_TRIM]))

# Hold floor + a dark interior backing, so looking up the open ramp reads as a
# bay rather than straight through the model.
bm = bmesh.new()
box(bm, 0.0, TAIL_Y - 2.30, DECK_Z - 0.09, FUS_W - 0.60, 4.30, 0.18)
box(bm, 0.0, TAIL_Y - 4.35, DECK_Z + 1.15, FUS_W - 0.62, 0.20, 2.40, mi=1)
parts.append(obj_from_bm('Dropship_Hold', bm, [M_HULL, M_TRIM]))

# Bay throat glow — reads as "there is light in there, go in"
bm = bmesh.new()
box(bm, 0.0, TAIL_Y - 0.45, DECK_Z + 2.42, 1.85, 0.10, 0.10)
for sx in (-1, 1):
    box(bm, sx * 1.18, TAIL_Y - 1.90, DECK_Z + 0.12, 0.08, 3.10, 0.07)
parts.append(obj_from_bm('Dropship_BayGlow', bm, [M_GLOWW]))

# ── Baked outline hull ───────────────────────────────────────────────────────
# Closed masses only. The game auto-hulls placed props at runtime unless the GLB
# carries a baked shell, and a runtime hull on the thin parts (glazing panes,
# wing strakes, ramp cleats, the glow strips) paints them solid black — the tent
# lesson. Shipping a hull here makes the runtime skip all of them.
bm = bmesh.new()
for nm in ('Dropship_Fuselage', 'Dropship_Boom', 'Dropship_Tail',
           'Dropship_Wings', 'Dropship_Pods', 'Dropship_Sponsons'):
    src = bpy.data.objects[nm]
    tmp = bmesh.new()
    tmp.from_mesh(src.data)
    tmp.normal_update()
    for v in tmp.verts:
        v.co += v.normal * 0.055
    me = bpy.data.meshes.new('t'); tmp.to_mesh(me); tmp.free()
    bm.from_mesh(me); bpy.data.meshes.remove(me)
bmesh.ops.reverse_faces(bm, faces=bm.faces)
hull_me = bpy.data.meshes.new('Dropship_OutlineHull')
bm.to_mesh(hull_me); bm.free()
hull = bpy.data.objects.new('Dropship_OutlineHull', hull_me)
hull.data.materials.append(mat('Ship_Ink', '000000'))
bpy.context.collection.objects.link(hull)
parts.append(hull)

# ── Export ───────────────────────────────────────────────────────────────────
coll = bpy.data.collections.new('Landing_Dropship')
bpy.context.scene.collection.children.link(coll)
for o in parts:
    for c in list(o.users_collection):
        c.objects.unlink(o)
    coll.objects.link(o)
coll['export_offset'] = (0.0, 0.0, 0.0)

bpy.ops.object.select_all(action='DESELECT')
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
path = os.path.join(OUT_DIR, 'Landing_Dropship.glb')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND)

tris = 0
for o in parts:
    o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
xs = [(o.matrix_world @ v.co) for o in parts for v in o.data.vertices]
print('DROPSHIP| tris=%d kb=%.1f  x %.2f..%.2f  y %.2f..%.2f  z %.2f..%.2f  rampFoot_y=%.2f'
      % (tris, os.path.getsize(path) / 1024,
         min(p.x for p in xs), max(p.x for p in xs),
         min(p.y for p in xs), max(p.y for p in xs),
         min(p.z for p in xs), max(p.z for p in xs), foot_y))
