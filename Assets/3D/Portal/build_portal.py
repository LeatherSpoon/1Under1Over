# Ancient World Gate v2 — VERTICAL walk-through portal (owner call, 2026-07-28).
# Replaces the original horizontal dais-and-well gate: the new gate is an
# upright half-buried stone ring with a vertical energy membrane the player
# physically passes through. Run headless:
#   blender -b --python Assets/3D/Portal/build_portal.py
# Outputs: models/Portal.glb, Assets/3D/Portal/Portal.blend, check renders in
# Assets/3D/Portal/renders/.
#
# Conventions (match the rest of the pipeline):
# - Blender Z up, game +z (camera side) = Blender -Y. Exporter bakes Y-up.
# - Node color inputs are LINEAR — convert sRGB palette hexes via the EOTF.
# - Runtime (_attachPortalModel) replaces the PortalMembrane's material with an
#   animated swirl shader and spins Portal_RuneRing about its own axis — those
#   two object names are load-bearing.
# - No baked outline hull: runtime hulls the stone parts only (smooth
#   primitives, no organic-soup poke-through risk).

import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix, noise

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
OUT_GLB = os.path.join(ROOT, 'models', 'Portal.glb')
OUT_BLEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Portal.blend')
RENDER_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'renders')
os.makedirs(RENDER_DIR, exist_ok=True)

# ── Gate numbers (game units) — mirrored by Environment.js collision/crossing ──
RING_MAJOR = 1.83    # mid-tube radius
RING_TUBE  = 0.28
RING_CZ    = 0.85    # ring centre height → inner edge hits ground at x ≈ ±1.30
MEMBRANE_R = 1.50
RUNE_RING_R = 1.70
FOOT_X     = 1.62    # footing centres — collision circles live here (r 0.5)

# ── Helpers ───────────────────────────────────────────────────────────────────
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hex_lin(hx):
    r = srgb_to_linear(((hx >> 16) & 255) / 255)
    g = srgb_to_linear(((hx >> 8) & 255) / 255)
    b = srgb_to_linear((hx & 255) / 255)
    return (r, g, b, 1.0)

def make_mat(name, hx, emissive=None, emit_strength=1.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = hex_lin(hx)
    bsdf.inputs['Roughness'].default_value = 0.9
    if emissive is not None:
        bsdf.inputs['Emission Color'].default_value = hex_lin(emissive)
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    if alpha < 1.0:
        bsdf.inputs['Alpha'].default_value = alpha
        if hasattr(m, 'blend_method'):
            m.blend_method = 'BLEND'
        if hasattr(m, 'surface_render_method'):
            m.surface_render_method = 'BLENDED'
    return m

MAT_STONE   = None  # filled in main()
MAT_STONED  = None
MAT_GOLD    = None
MAT_ENERGY  = None
MAT_KEY     = None

def obj_from_bm(bm, name, mat, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    me.materials.append(mat)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    bpy.context.collection.objects.link(ob)
    return ob

def weather(ob, amp=0.022, freq=1.7):
    """Subtle per-vertex noise along normals so primitives don't read machined."""
    me = ob.data
    for v in me.vertices:
        n = noise.noise(v.co * freq)
        v.co += v.normal * (n * amp)
    me.update()

def torus_bm(major, minor, seg_maj=56, seg_min=22):
    # bmesh has no torus op — build manually in the XZ plane (axis = Y)
    bm = bmesh.new()
    verts = []
    for i in range(seg_maj):
        a = 2 * math.pi * i / seg_maj
        ring = []
        ca, sa = math.cos(a), math.sin(a)
        for j in range(seg_min):
            b = 2 * math.pi * j / seg_min
            r = major + minor * math.cos(b)
            ring.append(bm.verts.new((ca * r, minor * math.sin(b), sa * r)))
        verts.append(ring)
    for i in range(seg_maj):
        for j in range(seg_min):
            v1 = verts[i][j]
            v2 = verts[(i + 1) % seg_maj][j]
            v3 = verts[(i + 1) % seg_maj][(j + 1) % seg_min]
            v4 = verts[i][(j + 1) % seg_min]
            bm.faces.new((v1, v2, v3, v4))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    return bm

def tapered_box_bm(w, d, h, taper=0.8):
    """Box grounded at z=0, top face scaled by `taper`."""
    bm = bmesh.new()
    hw, hd = w / 2, d / 2
    tw, td = hw * taper, hd * taper
    lo = [bm.verts.new(p) for p in ((-hw, -hd, 0), (hw, -hd, 0), (hw, hd, 0), (-hw, hd, 0))]
    hi = [bm.verts.new(p) for p in ((-tw, -td, h), (tw, -td, h), (tw, td, h), (-tw, td, h))]
    bm.faces.new(lo[::-1])
    bm.faces.new(hi)
    for i in range(4):
        bm.faces.new((lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    return bm

# ── Parts ─────────────────────────────────────────────────────────────────────
def build_ring():
    # Torus in the XZ plane (axis = Blender Y = game z): plane of the gate.
    bm = torus_bm(RING_MAJOR, RING_TUBE)
    ob = obj_from_bm(bm, 'Portal_Ring', MAT_STONE, smooth=True)
    ob.location = (0, 0, RING_CZ)
    # Weather in local space before export bake
    weather(ob, amp=0.024, freq=1.6)
    return ob

def build_ring_runes():
    """Gold filament + glyph plates on the camera face (-Y) of the stone ring."""
    # Filament hugs the aperture edge (not the tube mid-line) so it reads as
    # the event-horizon rim, distinct from the floating rune ring at R 1.70.
    bm = torus_bm(1.60, 0.04, seg_maj=64, seg_min=10)
    fil = obj_from_bm(bm, 'Portal_RingRunes', MAT_GOLD, smooth=True)
    fil.location = (0, -0.20, RING_CZ)
    # Glyph plates — 9 stations around the above-ground arc. θ=0 is the ring's
    # crown; ±110° stays above ground (the ring is buried below ~±135°).
    plates = []
    for k in range(9):
        th = math.radians(-100 + k * 25)
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= 0.10
            v.co.y *= 0.05
            v.co.z *= 0.17
        pl = obj_from_bm(bm, f'plate{k}', MAT_GOLD)
        # place at ring radius, proud of the tube's camera face, tangent-aligned
        pl.matrix_world = (Matrix.Translation((0, 0, RING_CZ))
                           @ Matrix.Rotation(th, 4, 'Y')
                           @ Matrix.Translation((0, -0.27, RING_MAJOR)))
        plates.append(pl)
    # Join plates into the filament object
    bpy.ops.object.select_all(action='DESELECT')
    for pl in plates:
        pl.select_set(True)
    fil.select_set(True)
    bpy.context.view_layer.objects.active = fil
    bpy.ops.object.join()
    return fil

def build_keystone():
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    ob = obj_from_bm(bm, 'Portal_Keystone', MAT_KEY, smooth=True)
    ob.scale = (0.30, 0.24, 0.44)
    ob.location = (0, 0, RING_CZ + RING_MAJOR + RING_TUBE - 0.02)
    return ob

def build_footings():
    obs = []
    for sx in (-1, 1):
        bm = tapered_box_bm(0.95, 0.85, 0.52, taper=0.72)
        ob = obj_from_bm(bm, f'Portal_Footing{"L" if sx < 0 else "R"}', MAT_STONED)
        ob.location = (sx * FOOT_X, 0, 0)
        weather(ob, amp=0.03, freq=2.2)
        obs.append(ob)
    return obs

def build_threshold():
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 1.15
        v.co.y *= 0.8
        v.co.z *= 0.025
    ob = obj_from_bm(bm, 'Portal_Threshold', MAT_STONED)
    ob.location = (0, 0, 0.025)
    return ob

def build_flank_stones():
    obs = []
    for sx, h in ((-1, 1.05), (1, 0.82)):
        bm = tapered_box_bm(0.42, 0.34, h, taper=0.55)
        ob = obj_from_bm(bm, f'Portal_Flank{"L" if sx < 0 else "R"}', MAT_STONE)
        ob.location = (sx * 2.55, 0.1, 0)
        ob.rotation_euler = (0, math.radians(sx * 4), math.radians(sx * 12))
        weather(ob, amp=0.028, freq=2.0)
        # small gold rune strip on the camera face
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= 0.05
            v.co.y *= 0.02
            v.co.z *= h * 0.4
        strip = obj_from_bm(bm, f'strip{sx}', MAT_GOLD)
        strip.location = (sx * 2.55, 0.1 - 0.18, h * 0.45)
        bpy.ops.object.select_all(action='DESELECT')
        strip.select_set(True)
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.join()
        obs.append(ob)
    return obs

def build_membrane():
    """Vertical energy disc — local XY (after Y-up bake) is the disc plane, so
    the runtime swirl shader can use length(position.xy) from the origin."""
    bm = bmesh.new()
    segs = 72
    center = bm.verts.new((0, 0, 0))
    rim = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        x = MEMBRANE_R * math.cos(a)
        z = MEMBRANE_R * math.sin(a)
        # clamp below-ground verts to just above the floor line (local z of the
        # disc centre is RING_CZ, so ground is local z = -RING_CZ)
        z = max(z, -RING_CZ + 0.03)
        rim.append(bm.verts.new((x, 0, z)))
    for i in range(segs):
        bm.faces.new((center, rim[i], rim[(i + 1) % segs]))
    bm.normal_update()
    ob = obj_from_bm(bm, 'PortalMembrane', MAT_ENERGY)
    ob.location = (0, 0, RING_CZ)
    return ob

def build_rune_ring():
    bm = torus_bm(RUNE_RING_R, 0.035, seg_maj=64, seg_min=8)
    ob = obj_from_bm(bm, 'Portal_RuneRing', MAT_GOLD, smooth=True)
    # 6 glyph blocks riding the ring (joined so they spin with it)
    glyphs = []
    for k in range(6):
        th = math.radians(k * 60)
        bmg = bmesh.new()
        bmesh.ops.create_cube(bmg, size=1.0)
        for v in bmg.verts:
            v.co.x *= 0.08
            v.co.y *= 0.045
            v.co.z *= 0.13
        g = obj_from_bm(bmg, f'glyph{k}', MAT_GOLD)
        g.matrix_world = (Matrix.Rotation(th, 4, 'Y')
                          @ Matrix.Translation((0, 0, RUNE_RING_R)))
        glyphs.append(g)
    bpy.ops.object.select_all(action='DESELECT')
    for g in glyphs:
        g.select_set(True)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.join()
    # origin at ring centre; float toward camera so it clears the stone ring
    ob.location = (0, -0.42, RING_CZ)
    return ob

# ── Check renders (shadowless Eevee, camera up-vector rule: -Z track, Y up) ──
def render_checks():
    scene = bpy.context.scene
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.eevee.taa_render_samples = 16
    world = bpy.data.worlds.new('W')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.5, 0.55, 0.62, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    scene.world = world
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3.0
    sun.data.use_shadow = False
    sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
    bpy.context.collection.objects.link(sun)

    # Render-only ground plane + 1.78-unit player-height reference block
    # (added AFTER the GLB export, so neither ships in the model).
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=12)
    ground = obj_from_bm(bm, 'CheckGround', MAT_STONED)
    ground.location = (0, 0, -0.01)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 0.5
        v.co.y *= 0.35
        v.co.z *= 1.78
        v.co.z += 0.89
    ref = obj_from_bm(bm, 'CheckPlayer', MAT_GOLD)
    ref.location = (3.6, -1.4, 0)

    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    target = Vector((0, 0, 1.4))
    shots = {
        # game view: from -Y (camera side), elevated ~46°
        'game_view': Vector((0, -9.5, 11.2)),
        'front':     Vector((0, -12, 2.2)),
        'side':      Vector((12, 0, 2.2)),
    }
    for name, pos in shots.items():
        cam.location = pos
        cam.rotation_euler = (pos - target).to_track_quat('Z', 'Y').to_euler()
        # to_track_quat('Z') points local +Z along the vector FROM target TO cam,
        # i.e. camera -Z (its view axis) looks AT the target, world Y as up ref.
        cam.data.type = 'ORTHO' if name == 'game_view' else 'PERSP'
        if name == 'game_view':
            cam.data.ortho_scale = 9.0
        scene.render.filepath = os.path.join(RENDER_DIR, f'{name}.png')
        bpy.ops.render.render(write_still=True)

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    global MAT_STONE, MAT_STONED, MAT_GOLD, MAT_ENERGY, MAT_KEY
    # wipe default scene
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)

    MAT_STONE  = make_mat('Stone', 0x8d96a4)
    MAT_STONED = make_mat('StoneDark', 0x566274)
    MAT_GOLD   = make_mat('GoldRune', 0xe0aa42, emissive=0xa87b2a, emit_strength=1.2)
    MAT_ENERGY = make_mat('PortalEnergy', 0x10a08d, emissive=0x19ffd2, emit_strength=2.0, alpha=0.9)
    MAT_KEY    = make_mat('Keystone', 0x63d9ff, emissive=0x74e6ff, emit_strength=2.5)

    build_ring()
    build_ring_runes()
    build_keystone()
    build_footings()
    build_threshold()
    build_flank_stones()
    build_membrane()
    build_rune_ring()

    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB')
    print('EXPORTED', OUT_GLB)

    render_checks()
    print('RENDERS DONE')

main()
