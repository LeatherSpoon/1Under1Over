# build_computerkit_v2.py — PROCEDURAL rebuild of the 8 ComputerKit Era-1 GLBs.
#
# v1 (build_computerkit.py) processed Rodin sketch-tier sculpts; the owner
# rejected them as GRAINY. v2 builds every piece from primitives: crisp
# geometry, flat palette colors (Starwing livery: warm white / gunmetal /
# game-teal 0x8fe8cc glow), soft Cycles AO baked into vertex colors (COLOR_0),
# ZERO image textures. "Data-centers are organized" — everything arrayed,
# aligned, symmetric.
#
# Run (all pieces):
#   & "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --factory-startup --python build_computerkit_v2.py
# Single-piece rebuild (opens the existing blend, replaces just those objects):
#   ... --python build_computerkit_v2.py -- CK1_Wall CK1_RoofPanel
#
# Conventions (the game reads these):
# - Blender axes: x = game-x width, y = game-z depth (FRONT = -Y, which the
#   y-up glTF export maps to +game-z), z = game-y height.
# - Origin base-center, grounded at z=0. export_apply=True, export_yup=True.
# - Self-glow material names match /glow|screen|led/i (kit.js MeshBasic path);
#   all other materials keep their flat color through the toon re-shade.
# - sRGB gotcha: node default_value colors are LINEAR — palette hexes go
#   through the sRGB EOTF (srgb2lin) or everything ships ~1.5 stops bright.
# - Vertex-color export: base colors stay UNLINKED constants (a linked Base
#   Color exports baseColorFactor white); export_vertex_color='ACTIVE'.
import bpy, math, os, sys
import mathutils

SRC_DIR = r'D:\2Under2Over\Assets\3D\ComputerKit'
MODELS = r'D:\2Under2Over\models'
RENDERS = os.path.join(SRC_DIR, 'renders_v2')
os.makedirs(RENDERS, exist_ok=True)

# ── Palette (game sRGB hexes) ────────────────────────────────────────────────
WHITE  = 0xe9e4d8   # warm white hull
WHITE2 = 0xd9d2c4   # panel alt
GUN    = 0x525a66   # gunmetal frame
GUNDK  = 0x3a4048   # dark gunmetal underside
INK    = 0x272b32   # stencil / vent slits
TEAL   = 0x8fe8cc   # game teal glow
AMBER  = 0xffcf7a   # bench work-light


def srgb2lin(hex_):
    out = []
    for sh in (16, 8, 0):
        c = ((hex_ >> sh) & 0xFF) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def get_mat(name, hex_):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = srgb2lin(hex_)
    bsdf.inputs['Roughness'].default_value = 0.85
    bsdf.inputs['Metallic'].default_value = 0.0
    m.diffuse_color = srgb2lin(hex_)
    return m


_parts = []          # objects of the piece currently being built


def add_box(w, d, h, x, y, z, mat, rot=None):
    """Box with dims (w=X, d=Y, h=Z) CENTERED at (x, y, z). rot = (rx,ry,rz) deg."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    ob = bpy.context.view_layer.objects.active
    ob.scale = (w, d, h)
    if rot:
        ob.rotation_euler = tuple(math.radians(a) for a in rot)
    ob.location = (x, y, z)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.data.materials.append(mat)
    _parts.append(ob)
    return ob


def add_tube(r, length, axis, x, y, z, mat):
    """Cylinder of radius r along `axis` ('X'/'Y') centered at (x,y,z)."""
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=length, vertices=10)
    ob = bpy.context.view_layer.objects.active
    ob.rotation_euler = (0, math.radians(90), 0) if axis == 'X' else (math.radians(90), 0, 0)
    ob.location = (x, y, z)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.data.materials.append(mat)
    _parts.append(ob)
    return ob


# ── Piece builders (front = -Y) ──────────────────────────────────────────────

def wall_common(P, door=False):
    """Shared wall recipe: 6.0 x 0.5 x 3.0, FLAT square ends (tiles edge to
    edge), ribbed panel rows on BOTH faces (walls get seeded pi-flips and are
    seen inside and out), full-length teal running light near the top."""
    clad = get_mat(P + '_Cladding', WHITE)
    trim = get_mat(P + '_Trim', GUN)
    panel = get_mat(P + '_Panel', WHITE2)
    accent = get_mat(P + '_Accent', INK)
    glow = get_mat(P + '_Glow', TEAL)

    core = add_box(6.0, 0.36, 3.0, 0, 0, 1.5, clad)
    skirt = add_box(6.0, 0.44, 0.35, 0, 0, 0.175, trim)
    add_box(6.0, 0.44, 0.22, 0, 0, 2.89, trim)                 # top rail
    strip = add_box(6.0, 0.50, 0.05, 0, 0, 2.79, glow)         # running light
    # panel grid: 4 cols x 2 rows, both faces (0.48 deep through the core)
    for xi in (-2.25, -0.75, 0.75, 2.25):
        if door and abs(xi) < 1.45:
            continue                                            # doorway columns
        for zj in (0.9575, 2.1725):
            add_box(1.34, 0.48, 1.05, xi, 0, zj, panel)
    # vent slits on the skirt, even row
    for xi in (-2.5, -1.5, -0.5, 0.5, 1.5, 2.5):
        if door and abs(xi) < 1.75:
            continue
        add_box(0.5, 0.46, 0.10, xi, 0, 0.175, accent)
    return core, skirt


def build_CK1_Wall():
    wall_common('CK1_Wall')


def build_CK1_WallDoor():
    core, skirt = wall_common('CK1_WallDoor', door=True)
    trim = get_mat('CK1_WallDoor_Trim', GUN)
    # boolean-cut the doorway through everything mid-opening (core + skirt)
    bpy.ops.mesh.primitive_cube_add(size=1)
    cutter = bpy.context.view_layer.objects.active
    cutter.scale = (2.6, 4.0, 2.62 * 2)     # extends below z=0 for a clean floor cut
    cutter.location = (0, 0, 0)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for ob in (core, skirt):
        mod = ob.modifiers.new('door', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = cutter
        mod.solver = 'EXACT'
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier='door')
    bpy.data.objects.remove(cutter)
    # frame: jambs centered on the cut edges, header over the top
    # clear opening: width 2.44 (>= 2.3), height 2.52 (>= 2.5)
    for sx in (-1.30, 1.30):
        add_box(0.16, 0.50, 2.62, sx, 0, 1.31, trim)
    add_box(2.76, 0.50, 0.16, 0, 0, 2.60, trim)


def build_CK1_RoofPanel():
    P = 'CK1_RoofPanel'
    deck = get_mat(P + '_Deck', WHITE2)
    trim = get_mat(P + '_Trim', GUN)
    dark = get_mat(P + '_Vent', GUNDK)
    accent = get_mat(P + '_Accent', INK)
    glow = get_mat(P + '_Glow', TEAL)
    add_box(6.0, 6.0, 0.28, 0, 0, 0.14, deck)                   # square slab
    # subtle rim (0.10 high) so interior tile joins still read fine
    for sy in (-2.91, 2.91):
        add_box(6.0, 0.18, 0.10, 0, sy, 0.33, trim)
    for sx in (-2.91, 2.91):
        add_box(0.18, 5.64, 0.10, sx, 0, 0.33, trim)
    # heat-exchanger ridges in even rows
    for yi in (-1.95, -0.65, 0.65, 1.95):
        add_box(4.6, 0.62, 0.16, 0, yi, 0.36, dark)
        add_box(4.4, 0.46, 0.04, 0, yi, 0.455, accent)
    # one condenser unit + corner beacon per tile (repeats read as organized)
    add_box(0.9, 0.9, 0.22, -2.2, 2.2, 0.39, deck)
    add_box(0.94, 0.7, 0.06, -2.2, 2.2, 0.485, accent)  # grill proud of the box top (coplanar z-fights)
    add_box(0.12, 0.12, 0.10, 2.55, -2.55, 0.33, glow)


def build_CK1_FieldTerminal():
    P = 'CK1_FieldTerminal'
    case = get_mat(P + '_Case', GUN)
    lid = get_mat(P + '_Lid', WHITE)
    dark = get_mat(P + '_Frame', GUNDK)
    accent = get_mat(P + '_Accent', INK)
    screen = get_mat(P + '_Screen', TEAL)
    for sy in (-0.30, 0.30):                                    # skid rails
        add_box(1.02, 0.14, 0.08, 0, sy, 0.04, dark)
    add_box(1.06, 0.86, 0.58, 0, 0, 0.37, case)                 # flight case
    add_box(1.06, 0.86, 0.10, 0, 0, 0.71, lid)                  # white lid
    add_box(1.00, 0.50, 0.34, 0, 0.16, 0.93, lid)               # console riser
    # sloped console face, tilting up toward the front (-Y)
    add_box(0.94, 0.06, 0.46, 0, -0.13, 0.93, dark, rot=(-38, 0, 0))
    add_box(0.80, 0.05, 0.32, 0, -0.155, 0.93, screen, rot=(-38, 0, 0))
    for xi in (-0.35, 0.0, 0.35):                               # latch row
        add_box(0.08, 0.90, 0.16, xi, 0, 0.60, accent)


def build_CK1_MissionServer():
    P = 'CK1_MissionServer'
    hull = get_mat(P + '_Hull', WHITE)
    frame = get_mat(P + '_Frame', GUN)
    dark = get_mat(P + '_Base', GUNDK)
    slat = get_mat(P + '_Bays', INK)
    led = get_mat(P + '_LED', TEAL)
    add_box(3.64, 4.54, 0.10, 0, 0, 0.05, dark)                 # plinth
    TD = 1.96                                                   # tower depth
    for tx in (-1.045, 1.045):
        for ty in (-1.25, 1.25):
            add_box(1.55, TD, 1.55, tx, ty, 0.875, hull)        # tower body
            add_box(1.55, TD, 0.15, tx, ty, 1.725, frame)       # cap
            for cx in (-0.715, 0.715):                          # corner posts
                for cy in (-TD / 2 + 0.06, TD / 2 - 0.06):
                    add_box(0.12, 0.12, 1.62, tx + cx, ty + cy, 0.91, frame)
            # bay slats in perfect rows on both y faces
            for fy in (-1, 1):
                fyy = ty + fy * (TD / 2 + 0.015)
                for k in range(6):
                    add_box(1.15, 0.05, 0.10, tx - 0.10, fyy, 0.38 + k * 0.21, slat)
                # LED status strip beside the bays
                add_box(0.06, 0.04, 1.16, tx + 0.60, fyy, 0.90, led)
    # cable trays crossing the cluster (neat swept tubes)
    for cx in (-0.5, 0.5):
        add_tube(0.055, 4.30, 'Y', cx, 0, 1.79, dark)
    add_tube(0.055, 3.30, 'X', 0, 0, 1.845, dark)   # keeps total height ~1.90 vs the 1.80 read


def build_CK1_IntegrationBench():
    P = 'CK1_IntegrationBench'
    top = get_mat(P + '_Top', WHITE)
    frame = get_mat(P + '_Frame', GUN)
    crate = get_mat(P + '_Crates', WHITE2)
    accent = get_mat(P + '_Accent', INK)
    glow = get_mat(P + '_Glow', AMBER)
    for sx in (-0.66, 0.66):                                    # legs
        for sy in (-0.36, 0.36):
            add_box(0.10, 0.10, 0.90, sx, sy, 0.45, frame)
    add_box(1.42, 0.78, 0.06, 0, 0, 0.30, frame)                # lower shelf
    add_box(1.52, 0.91, 0.10, 0, 0, 0.95, top)                  # worktop
    add_box(1.40, 0.03, 0.05, 0, -0.465, 0.905, glow)           # amber work-light
    for xi in (-0.45, 0.0, 0.45):                               # aligned kit crates
        add_box(0.34, 0.50, 0.30, xi, 0, 0.48, crate)
        add_box(0.36, 0.10, 0.05, xi, -0.21, 0.55, accent)
    add_box(1.30, 0.14, 0.02, 0, 0.30, 1.005, accent)           # tool strip inset


def build_CK1_ExpeditionRack():
    P = 'CK1_ExpeditionRack'
    hull = get_mat(P + '_Hull', WHITE)
    frame = get_mat(P + '_Frame', GUN)
    dark = get_mat(P + '_Base', GUNDK)
    slat = get_mat(P + '_Units', INK)
    led = get_mat(P + '_LED', TEAL)
    add_box(1.32, 0.90, 0.12, 0, 0, 0.06, dark)                 # plinth
    add_box(1.22, 0.74, 2.32, 0, 0, 1.28, hull)                 # cabinet
    for sx in (-0.61, 0.61):                                    # frame posts
        for sy in (-0.40, 0.40):
            add_box(0.10, 0.10, 2.36, sx, sy, 1.30, frame)
    add_box(1.32, 0.90, 0.12, 0, 0, 2.54, hull)                 # top cap
    # server units in one perfect column on the FRONT (-Y) face
    for k in range(9):
        m = slat if k % 2 == 0 else dark
        add_box(0.92, 0.06, 0.20, -0.08, -0.40, 0.35 + k * 0.24, m)
    # teal LED status column, front face right edge (yaw 0 faces +game-z)
    add_box(0.08, 0.05, 2.04, 0.48, -0.415, 1.37, led)


def build_CK1_Pallet():
    P = 'CK1_Pallet'
    deck = get_mat(P + '_Deck', GUN)
    dark = get_mat(P + '_Skids', GUNDK)
    crate = get_mat(P + '_CrateA', WHITE)
    crate2 = get_mat(P + '_CrateB', WHITE2)
    strap = get_mat(P + '_Strap', TEAL)     # teal accent, NOT glow-named
    accent = get_mat(P + '_Accent', INK)
    for xi in (-0.55, 0.0, 0.55):                               # skids
        add_box(0.14, 0.95, 0.10, xi, 0, 0.05, dark)
    for k in range(6):                                          # deck slats
        add_box(1.30, 0.13, 0.05, 0, -0.41 + k * 0.164, 0.125, deck)
    for sx in (-0.31, 0.31):                                    # layer 1: 2x2 crates
        for sy in (-0.24, 0.24):
            add_box(0.56, 0.42, 0.52, sx, sy, 0.41, crate)
    for sx in (-0.31, 0.31):                                    # layer 2: long crates
        add_box(0.60, 0.88, 0.50, sx, 0, 0.92, crate2)
        add_box(0.62, 0.06, 0.52, sx, 0, 0.92, strap)           # strap band
    add_box(0.55, 0.45, 0.20, 0, 0, 1.27, deck)                 # top case
    add_box(0.20, 0.02, 0.20, -0.31, -0.455, 0.41, accent)      # stencil mark


PIECES = [
    ('CK1_Wall', build_CK1_Wall),
    ('CK1_WallDoor', build_CK1_WallDoor),
    ('CK1_RoofPanel', build_CK1_RoofPanel),
    ('CK1_FieldTerminal', build_CK1_FieldTerminal),
    ('CK1_MissionServer', build_CK1_MissionServer),
    ('CK1_IntegrationBench', build_CK1_IntegrationBench),
    ('CK1_ExpeditionRack', build_CK1_ExpeditionRack),
    ('CK1_Pallet', build_CK1_Pallet),
]


# ── Finalize: join, densify, UV, AO bake into COLOR_0, export ────────────────

def spans(ob):
    vs = ob.data.vertices
    mn = [min(v.co[i] for v in vs) for i in range(3)]
    mx = [max(v.co[i] for v in vs) for i in range(3)]
    return [mx[i] - mn[i] for i in range(3)], mn, mx


def densify(ob, max_edge=0.30, max_iter=7):
    """Subdivide long edges so the AO vertex bake has enough sample points —
    boxes bake near-uniform AO with only corner verts. Surfaces stay planar,
    so the extra tris are invisible; flat shading is kept (crisp)."""
    import bmesh
    me = ob.data
    for _ in range(max_iter):
        bm = bmesh.new()
        bm.from_mesh(me)
        long_edges = [e for e in bm.edges if e.calc_length() > max_edge]
        if not long_edges:
            bm.free()
            break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=True)
        bm.to_mesh(me)
        bm.free()


def bake_ao(ob):
    """Cycles AO -> active color attribute (COLOR_0). Mesh keeps a UV layer
    even though unused (Cycles vertex-color bakes require one — MineKit rule)."""
    if not ob.data.uv_layers:
        ob.data.uv_layers.new(name='UVMap')
    attr = ob.data.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
    ob.data.color_attributes.active_color = attr
    scene = bpy.context.scene
    prev_engine = scene.render.engine
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    try:
        scene.world.light_settings.distance = 1.4
    except Exception:
        pass
    scene.render.bake.target = 'VERTEX_COLORS'
    # isolate: AO must see only this piece
    hidden = []
    for o in bpy.data.objects:
        if o.type == 'MESH' and o is not ob and not o.hide_render:
            o.hide_render = True
            hidden.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO')
    for o in hidden:
        o.hide_render = False
    scene.render.engine = prev_engine
    # soften: raw AO pits go near-black; lift into a gentle shading band
    attr = ob.data.color_attributes.get('Col')
    lo, hi = 1.0, 0.0
    for d in attr.data:
        v = d.color[0]
        lo, hi = min(lo, v), max(hi, v)
        s = 0.52 + 0.48 * v
        d.color = (s, s, s, 1.0)
    print('  AO baked: raw range %.3f..%.3f (lifted to %.3f..%.3f)'
          % (lo, hi, 0.52 + 0.48 * lo, 0.52 + 0.48 * hi))


def look_at(cam, target):
    """World +Z pinned up — NEVER to_track_quat('-Z','Z') (degenerate roll)."""
    f = (target - cam.location).normalized()
    r = f.cross(mathutils.Vector((0, 0, 1)))
    if r.length < 1e-6:
        r = mathutils.Vector((1, 0, 0))
    r.normalize()
    u = r.cross(f)
    cam.rotation_euler = mathutils.Matrix((r, u, -f)).transposed().to_euler()


def render_view(objs, out_png, azimuth_deg, elev_deg=46, pad=0.75):
    scene = bpy.context.scene
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            scene.render.engine = eng
            break
        except Exception:
            pass
    vis = set(objs)
    for o in bpy.data.objects:
        if o.type == 'MESH':
            o.hide_render = o not in vis
    if 'CK_Sun' not in bpy.data.objects:
        sun = bpy.data.objects.new('CK_Sun', bpy.data.lights.new('CK_Sun', 'SUN'))
        sun.data.energy = 3.0
        sun.data.use_shadow = False
        sun.rotation_euler = (0.9, 0, 0.6)
        scene.collection.objects.link(sun)
    if 'CK_Cam' not in bpy.data.objects:
        cam = bpy.data.objects.new('CK_Cam', bpy.data.cameras.new('CK_Cam'))
        scene.collection.objects.link(cam)
    cam = bpy.data.objects['CK_Cam']
    scene.camera = cam
    mn = [min(min(v.co[i] + o.location[i] for v in o.data.vertices) for o in objs) for i in range(3)]
    mx = [max(max(v.co[i] + o.location[i] for v in o.data.vertices) for o in objs) for i in range(3)]
    center = mathutils.Vector(((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2))
    radius = max(mx[i] - mn[i] for i in range(3)) * pad + 0.5
    az, el = math.radians(azimuth_deg), math.radians(elev_deg)
    dist = radius * 2.6
    cam.location = center + mathutils.Vector((
        dist * math.cos(el) * math.sin(az),
        -dist * math.cos(el) * math.cos(az),
        dist * math.sin(el)))
    look_at(cam, center)
    cam.data.lens = 50
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.filepath = out_png
    bpy.ops.render.render(write_still=True)
    for o in bpy.data.objects:
        if o.type == 'MESH':
            o.hide_render = False


def export_piece(ob, name):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    out = os.path.join(MODELS, name + '.glb')
    kwargs = dict(filepath=out, export_format='GLB', use_selection=True,
                  export_apply=True, export_yup=True)
    try:
        bpy.ops.export_scene.gltf(**kwargs, export_vertex_color='ACTIVE')
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs)
    print('  exported %s (%d KB)' % (out, os.path.getsize(out) // 1024))


def process(name, builder):
    global _parts
    print('=== %s ===' % name)
    _parts = []
    builder()
    bpy.ops.object.select_all(action='DESELECT')
    for o in _parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = _parts[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    densify(ob)
    bake_ao(ob)
    sp, mn, mx = spans(ob)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print('  FINAL dims (game w*d*h): %.3f x %.3f x %.3f | ground z %.3f | tris %d'
          % (sp[0], sp[1], sp[2], mn[2], tris))
    render_view([ob], os.path.join(RENDERS, name + '_front34.png'), 30)
    render_view([ob], os.path.join(RENDERS, name + '_back34.png'), 210)
    if name == 'CK1_WallDoor':
        render_view([ob], os.path.join(RENDERS, name + '_doorfront.png'), 0, elev_deg=10)
    export_piece(ob, name)
    return ob


def tiled_checks():
    """Prove the wall tiles seamlessly x3 and roof tiles join 2x2."""
    wall = bpy.data.objects.get('CK1_Wall')
    if wall:
        copies = []
        for dx in (-6.0, 6.0):
            c = wall.copy()
            c.location = (wall.location[0] + dx, wall.location[1], wall.location[2])
            bpy.context.scene.collection.objects.link(c)
            copies.append(c)
        render_view([wall] + copies, os.path.join(RENDERS, 'CK1_Wall_tiled3.png'), 12, elev_deg=20, pad=0.55)
        render_view([wall] + copies, os.path.join(RENDERS, 'CK1_Wall_tiled3_46.png'), 30, elev_deg=46, pad=0.55)
        for c in copies:
            bpy.data.objects.remove(c)
    roof = bpy.data.objects.get('CK1_RoofPanel')
    if roof:
        copies = []
        for dx, dy in ((-3, -3), (-3, 3), (3, -3), (3, 3)):
            c = roof.copy()
            c.location = (roof.location[0] + dx, roof.location[1] + dy, roof.location[2])
            bpy.context.scene.collection.objects.link(c)
            copies.append(c)
        roof.hide_render = True
        render_view(copies, os.path.join(RENDERS, 'CK1_RoofPanel_2x2.png'), 30, elev_deg=50, pad=0.6)
        for c in copies:
            bpy.data.objects.remove(c)
        roof.hide_render = False


def main():
    only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else None
    blend = os.path.join(SRC_DIR, 'ComputerKit.blend')
    if only and os.path.exists(blend):
        bpy.ops.wm.open_mainfile(filepath=blend)
        for nm in only:
            ob = bpy.data.objects.get(nm)
            if ob:
                bpy.data.objects.remove(ob, do_unlink=True)
    else:
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.delete()
        for coll in (bpy.data.meshes, bpy.data.materials):
            for d in list(coll):
                if d.users == 0:
                    coll.remove(d)
    built = []
    for name, builder in PIECES:
        if only and name not in only:
            continue
        built.append(process(name, builder))
    tiled_checks()   # pieces still at origin — copies offset from (0,0,0)
    # park pieces on a spaced grid so the saved blend is browsable (exports
    # already happened at origin; single-piece rebuilds re-build at origin)
    for i, ob in enumerate([o for o in bpy.data.objects
                            if o.type == 'MESH' and o.name.startswith('CK1_')]):
        ob.location = ((i % 4) * 10.0, (i // 4) * 10.0, 0)
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    print('=== ComputerKit v2 build complete ===')


main()
