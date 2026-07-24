# build_shell.py — Spaceship interior hull shell for Processing Power.
# Run inside Blender (via blender-mcp execute_code: exec(open(path).read())).
# Builds deck + walls + ribs + hatch + portholes + wall screens, bakes a
# flipped-normal outline hull (boxes only), saves the .blend and exports
# models/SpaceshipShell.glb at true world scale (1 unit = 1 game unit).
#
# Coordinate mapping: game (x, z) -> Blender (x, -z); glTF export converts back.
# Game camera sits at +z (south) looking north, so SOUTH (blender -y) stays low.
# Palette hexes are sRGB; node colors must be linear (CLAUDE.md gotcha).
import bpy
import math
import random

random.seed(77)

BLEND_PATH = 'D:/1Under1OverToo/Assets/3D/SpaceshipInterior/SpaceshipInterior.blend'
GLB_PATH = 'D:/1Under1OverToo/models/SpaceshipShell.glb'
HULL_OFF = 0.04  # outline hull offset per side, world units

# ── clean scene ──────────────────────────────────────────────────────────────
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.meshes):
    if m.users == 0:
        bpy.data.meshes.remove(m)
for m in list(bpy.data.materials):
    if m.users == 0:
        bpy.data.materials.remove(m)

# ── materials ────────────────────────────────────────────────────────────────
def srgb2lin(h):
    c = [((h >> 16) & 255) / 255.0, ((h >> 8) & 255) / 255.0, (h & 255) / 255.0]
    return tuple((v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c) + (1.0,)

MATS = {}
def mat(name, hexc, emissive=None, estr=1.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = srgb2lin(hexc)
    bsdf.inputs['Roughness'].default_value = 1.0
    bsdf.inputs['Metallic'].default_value = 0.0
    if emissive is not None:
        for key in ('Emission Color', 'Emission'):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = srgb2lin(emissive)
                break
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = estr
    MATS[name] = m
    return m

CREAM   = mat('Hull_Cream',   0xE8DCC2)
TEAL    = mat('Hull_Patina',  0x4E8F86)
BRONZE  = mat('Hull_Bronze',  0x54402F)
BRASS   = mat('Hull_Brass',   0xC9973F)
WALNUT  = mat('Hull_Walnut',  0x4A3F38)
WOOD_A  = mat('Deck_WoodA',   0xA9784F)
WOOD_B  = mat('Deck_WoodB',   0x97694A)
WOOD_C  = mat('Deck_WoodC',   0xB5824F)
GLOW    = mat('Glow_Teal',    0x0D2F2A, emissive=0x35E0C0, estr=1.2)
SCREEN  = mat('Glow_Screen',  0x0D3A33, emissive=0x2FAE9A, estr=1.0)
PORT    = mat('Glow_Port',    0x274A5E, emissive=0xBFE4FF, estr=0.8)
INK     = mat('Hull_Ink',     0x000000)

# ── primitives ───────────────────────────────────────────────────────────────
struct_parts = []   # opaque architecture (joined -> Shell_Structure)
deck_parts = []     # floor (joined -> Shell_Deck)
glow_parts = []     # emissive (joined -> Shell_Glow)
hull_sources = []   # boxes that get a baked outline shell

def box(sx, sy, sz, x, y, z, m, bucket, hull=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    o = bpy.context.active_object
    o.scale = (sx, sy, sz)
    o.data.materials.append(m)
    bucket.append(o)
    if hull:
        hull_sources.append(o)
    return o

def torus(major, minor, x, y, z, rotx, m, bucket):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     location=(x, y, z), rotation=(rotx, 0, 0))
    o = bpy.context.active_object
    o.data.materials.append(m)
    bucket.append(o)
    return o

def cylin(r, depth, x, y, z, rotx, m, bucket):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=24,
                                        location=(x, y, z), rotation=(rotx, 0, 0))
    o = bpy.context.active_object
    o.data.materials.append(m)
    bucket.append(o)
    return o

# ── deck (thin: top at ~0.02 so feet don't bury) ────────────────────────────
# border frame (walnut): outer 21.9, inner 21.0
for (bx, by, bsx, bsy) in [(0, 10.725, 21.9, 0.45), (0, -10.725, 21.9, 0.45),
                           (10.725, 0, 0.45, 21.0), (-10.725, 0, 0.45, 21.0)]:
    box(bsx, bsy, 0.02, bx, by, 0.014, WALNUT, deck_parts)

# planks run east-west, rows along y spanning x -10.5..10.5
row_w = 21.0 / 21
woods = [WOOD_A, WOOD_B, WOOD_C]
for i in range(21):
    y = -10.5 + row_w * (i + 0.5)
    wmat = woods[i % 3]
    if random.random() < 0.45:  # split row into two planks w/ different tones
        split = random.uniform(-6, 6)
        lw = split - (-10.5)
        rw = 10.5 - split
        box(lw, row_w, 0.016, -10.5 + lw / 2, y, 0.012, wmat, deck_parts)
        box(rw, row_w, 0.016, split + rw / 2, y, 0.012, woods[(i + 1) % 3], deck_parts)
    else:
        box(21.0, row_w, 0.016, 0, y, 0.012, wmat, deck_parts)

# brass center inlay ring (flattened torus, sits proud of planks) + inner ring
ring = torus(2.85, 0.13, 0, 0, 0.022, 0, BRASS, deck_parts)
ring.scale = (1, 1, 0.16)
ring2 = torus(2.3, 0.06, 0, 0, 0.022, 0, WALNUT, deck_parts)
ring2.scale = (1, 1, 0.3)

# ── north wall (blender +y) with hatch gap x in [-2, 2] ─────────────────────
WALL_H = 2.4
for (cx, length) in [(-6.625, 9.25), (6.625, 9.25)]:
    box(length, 0.7, 0.3, cx, 11.0, 0.15, BRONZE, struct_parts, hull=True)          # skirt
    box(length, 0.5, WALL_H - 0.3, cx, 11.0, 0.3 + (WALL_H - 0.3) / 2, CREAM, struct_parts, hull=True)  # panel
    box(length, 0.56, 0.75, cx, 10.97, 0.3 + 0.375, TEAL, struct_parts, hull=True)  # wainscot band
    box(length, 0.56, 0.12, cx, 10.97, 2.42, BRASS, struct_parts, hull=True)        # top trim

# ── east / west walls (full height — parallel to view, never occlude) ───────
for sx_sign in (1, -1):
    x = 11.0 * sx_sign
    box(0.7, 22.5, 0.3, x, 0, 0.15, BRONZE, struct_parts, hull=True)
    box(0.5, 22.5, WALL_H - 0.3, x, 0, 0.3 + (WALL_H - 0.3) / 2, CREAM, struct_parts, hull=True)
    box(0.56, 22.5, 0.75, x - 0.03 * sx_sign, 0, 0.675, TEAL, struct_parts, hull=True)
    box(0.56, 22.5, 0.12, x - 0.03 * sx_sign, 0, 2.42, BRASS, struct_parts, hull=True)

# ── south rim (low bulkhead + brass cap rail; camera side) ──────────────────
box(21.9, 0.7, 0.28, 0, -11.0, 0.14, BRONZE, struct_parts, hull=True)
box(21.9, 0.5, 0.44, 0, -11.0, 0.28 + 0.22, TEAL, struct_parts, hull=True)
box(21.9, 0.6, 0.18, 0, -11.0, 0.81, BRASS, struct_parts, hull=True)

# ── corner columns ──────────────────────────────────────────────────────────
for cx in (11.0, -11.0):
    box(0.62, 0.62, 2.7, cx, 11.0, 1.35, BRONZE, struct_parts, hull=True)   # N corners
    box(0.72, 0.72, 0.15, cx, 11.0, 2.775, BRASS, struct_parts, hull=True)
    box(0.62, 0.62, 1.05, cx, -11.0, 0.525, BRONZE, struct_parts, hull=True)  # S corners
    box(0.72, 0.72, 0.15, cx, -11.0, 1.125, BRASS, struct_parts, hull=True)

# ── ribs ────────────────────────────────────────────────────────────────────
def rib_n(x):
    box(0.3, 0.72, 2.55, x, 11.0, 1.275, BRONZE, struct_parts, hull=True)
    box(0.38, 0.78, 0.14, x, 11.0, 2.62, BRASS, struct_parts, hull=True)
for x in (4.0, 6.75, 9.5):
    rib_n(x); rib_n(-x)

def rib_ew(x, y):
    box(0.72, 0.3, 2.55, x, y, 1.275, BRONZE, struct_parts, hull=True)
    box(0.78, 0.38, 0.14, x, y, 2.62, BRASS, struct_parts, hull=True)
for y in (-8.0, -4.0, 0.0, 4.0, 8.0):
    rib_ew(11.0, y); rib_ew(-11.0, y)

# south rim posts w/ mini caps
for x in (-8.0, -4.0, 0.0, 4.0, 8.0):
    box(0.3, 0.72, 1.0, x, -11.0, 0.5, BRONZE, struct_parts, hull=True)
    box(0.38, 0.78, 0.12, x, -11.0, 1.06, BRASS, struct_parts, hull=True)

# ── hatch frame (north gap -> Workspace) ────────────────────────────────────
for px in (2.2, -2.2):
    box(0.5, 0.9, 2.8, px, 11.0, 1.4, WALNUT, struct_parts, hull=True)
    box(0.58, 0.96, 0.14, px, 11.0, 2.87, BRASS, struct_parts, hull=True)
box(4.9, 0.8, 0.4, 0, 11.0, 3.0, WALNUT, struct_parts, hull=True)   # lintel
box(4.4, 0.86, 0.1, 0, 11.0, 2.74, BRASS, struct_parts, hull=True)  # lintel brass edge
# dark corridor mouth behind the hatch gap (so the opening isn't raw skybox)
DARK = mat('Hull_Dark', 0x141824)
box(4.2, 0.15, 2.8, 0, 11.8, 1.4, DARK, struct_parts)               # back panel
box(0.25, 1.4, 2.7, 1.95, 11.6, 1.35, DARK, struct_parts)           # side reveals
box(0.25, 1.4, 2.7, -1.95, 11.6, 1.35, DARK, struct_parts)
# hatch glow strips (inner pillar edges + under lintel)
for px in (1.88, -1.88):
    box(0.07, 0.5, 2.2, px, 10.92, 1.3, GLOW, glow_parts)
box(3.6, 0.5, 0.07, 0, 10.92, 2.62, GLOW, glow_parts)

# ── teal accent glow line along wainscot tops (replaces old cyan strips) ────
for (cx, length) in [(-6.625, 9.25), (6.625, 9.25)]:
    box(length, 0.06, 0.05, cx, 10.66, 1.08, GLOW, glow_parts)          # north segs
for sx_sign in (1, -1):
    box(0.06, 21.5, 0.05, (11.0 - 0.34) * sx_sign, 0, 1.08, GLOW, glow_parts)  # e/w
box(21.5, 0.06, 0.05, 0, -10.66, 0.66, GLOW, glow_parts)               # south rim line

# ── portholes on north wall (brass ring + glowing glass) ────────────────────
for px in (8.125, 5.375, -5.375, -8.125):
    torus(0.42, 0.07, px, 10.68, 1.55, math.pi / 2, BRASS, struct_parts)
    cylin(0.36, 0.06, px, 10.76, 1.55, math.pi / 2, PORT, glow_parts)

# ── wall screens on east/west walls (re-imagined holo panels, game z=-5) ────
for sx_sign in (1, -1):
    x_frame = (11.0 - 0.38) * sx_sign
    box(0.18, 2.7, 1.9, x_frame, 5.0, 1.7, WALNUT, struct_parts, hull=True)
    box(0.06, 2.4, 1.6, x_frame - 0.09 * sx_sign, 5.0, 1.7, SCREEN, glow_parts)
    for by in (3.9, 6.1):  # brass brackets
        box(0.3, 0.16, 0.16, (11.0 - 0.2) * sx_sign, by, 2.05, BRASS, struct_parts, hull=True)

# ── baked outline hull (scaled flipped copies of hullable boxes) ────────────
hull_copies = []
for src in hull_sources:
    dup = src.copy()
    dup.data = src.data.copy()
    bpy.context.collection.objects.link(dup)
    dup.scale = (src.scale[0] + 2 * HULL_OFF, src.scale[1] + 2 * HULL_OFF, src.scale[2] + 2 * HULL_OFF)
    dup.data.materials.clear()
    dup.data.materials.append(INK)
    hull_copies.append(dup)

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    j = bpy.context.active_object
    j.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return j

structure = join(struct_parts, 'Shell_Structure')
deck = join(deck_parts, 'Shell_Deck')
glow = join(glow_parts, 'Shell_Glow')
hull = join(hull_copies, 'Shell_OutlineHull')

# flip hull normals (single pass on the joined mesh)
bpy.ops.object.select_all(action='DESELECT')
hull.select_set(True)
bpy.context.view_layer.objects.active = hull
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.flip_normals()
bpy.ops.object.mode_set(mode='OBJECT')
hull.data.materials.clear()
hull.data.materials.append(INK)
INK.use_backface_culling = True

# ── save + export ───────────────────────────────────────────────────────────
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)

bpy.ops.object.select_all(action='DESELECT')
for o in (structure, deck, glow, hull):
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format='GLB', use_selection=True)
print('SHELL OK — objects:', [o.name for o in (structure, deck, glow, hull)])
print('tris:', sum(len(o.data.polygons) for o in (structure, deck, glow, hull)))
