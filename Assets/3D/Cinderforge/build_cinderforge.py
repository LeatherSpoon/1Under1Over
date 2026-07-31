# build_cinderforge.py — BOOTSTRAP processor for the volcanic forge-maze kit.
#
#   blender -b --factory-startup --python Assets/3D/Cinderforge/build_cinderforge.py
#
# Imports each rodin_Forge_*_raw.glb beside this script, runs the shared Rodin
# recipe (join -> single 512px diffuse -> orient -> normalize -> decimate),
# exports models/<Name>.glb, then parks the asset on its own row of
# Cinderforge.blend with a matching collection 'export_offset' so the blend
# rides the watch-assets owner-edit path. Re-running OVERWRITES hand edits —
# once the .blend is hand-edited, it is the source of truth (export_blend.py).
import bpy, os, sys, math, mathutils

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(HERE, '..', 'VerdantMaw'))
import rodin_process as rp

MODELS = r'D:\2Under2Over\models'
RENDERS = os.path.join(HERE, 'renders')
os.makedirs(RENDERS, exist_ok=True)

# name -> (raw suffix, target height, decimate tris). Walls instance heavily
# -> lean. Forge_WallStraight's height is IGNORED: it is normalized to the
# kit length 4.52 instead (the Labyrinth join rule — layout.js multiplies
# scaleXYZ.x by 1.13 to close the 5-unit cell joins), height follows aspect.
ASSETS = [
    ('Forge_WallStraight', 'rodin_Forge_WallStraight_raw.glb', 2.8, 8000),
    # BOTH ArchGate rolls came back lying RINGS of blocks (doorframe is a
    # Rodin text-mode weakness here) — so the kit leans in: the threshold
    # piece ships as an upright half-buried ring, an unfinished World Gate
    # casting standing in the forge that cast the real ones. Ring-specific
    # normalize below (width 4.2, aperture bottom sunk 0.18 under the floor).
    ('Forge_ArchGate',     'rodin_Forge_ArchGate2_raw.glb',    3.4, 8000),
    ('Forge_Golem',        'rodin_Forge_Golem_raw.glb',        3.2, 10000),
    ('Forge_Anvil',        'rodin_Forge_Anvil_raw.glb',        2.0, 8000),
    ('Forge_Crucible',     'rodin_Forge_Crucible_raw.glb',     1.8, 8000),
    ('Forge_Vent',         'rodin_Forge_Vent_raw.glb',         2.0, 6000),
    ('Forge_Brazier',      'rodin_Forge_Brazier_raw.glb',      1.2, 6000),
    # Stele re-roll: roll 1's runes were faint rim scratches; roll 2 carries
    # real glyphs across the face (silver, not the asked-for orange — the
    # braziers placed beside each stele supply the warmth).
    ('Forge_RuneStele',    'rodin_Forge_RuneStele2_raw.glb',   1.6, 5000),
    ('Forge_BrokenColumn', 'rodin_Forge_BrokenColumn_raw.glb', 2.0, 6000),
    ('Forge_Rubble',       'rodin_Forge_Rubble_raw.glb',       0.7, 6000),
    ('Forge_IngotStack',   'rodin_Forge_IngotStack_raw.glb',   1.0, 5000),
    ('Forge_Gargoyle',     'rodin_Forge_Gargoyle_raw.glb',     1.6, 8000),
    # Column re-roll: roll 1 was a lamp-post (side-facing hex head); roll 2
    # is a clean vertical post but ships with a stray base beam along Y —
    # trimmed to the post footprint below (see the Forge_Column special case).
    ('Forge_Column',       'rodin_Forge_Column2_raw.glb',      3.0, 6000),
]
PARK_STEP = 60  # units between parked assets along +X

# Render-sweep verified rotations (mesh-space, applied INSTEAD of the slab
# test — the sweep is the authority, the Lab kit lesson): name -> (rad, axis).
# Uprights are listed explicitly at identity so the slab test never runs
# (it misread the Crucible's open bowl rim as a base, among others).
FORCED_ROT = {
    'Forge_WallStraight': (math.pi / 2, 'X'),   # lava face stands up, faces -Y
    'Forge_ArchGate': (math.pi / 2, 'X'),       # ring stands up, faces -Y
    'Forge_Golem': (0, 'X'),                    # upright, faces -Y (= game +z)
    'Forge_Anvil': (0, 'X'),
    'Forge_Crucible': (0, 'X'),
    'Forge_Vent': (0, 'X'),
    'Forge_Brazier': (0, 'X'),
    'Forge_RuneStele': (math.pi / 2, 'X'),      # tablet stands up, face -Y
    'Forge_BrokenColumn': (0, 'X'),
    'Forge_Rubble': (0, 'X'),
    'Forge_IngotStack': (0, 'X'),
    'Forge_Gargoyle': (0, 'X'),
    'Forge_Column': (0, 'X'),                   # re-roll post stands upright already
}


def fresh_scene():
    bpy.ops.wm.read_homefile(use_empty=True)


def setup_render_rig():
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            bpy.context.scene.render.engine = eng
            break
        except Exception:
            pass
    sun = bpy.data.objects.new('RenderSun', bpy.data.lights.new('RenderSun', 'SUN'))
    sun.data.energy = 3.0
    sun.data.use_shadow = False
    sun.rotation_euler = (0.9, 0, 0.6)
    bpy.context.scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('RenderCam', bpy.data.cameras.new('RenderCam'))
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    bpy.context.scene.render.resolution_x = 640
    bpy.context.scene.render.resolution_y = 640
    return cam


def render_at(cam, center, height, out_png, yaw_deg=35):
    """Perspective 3/4 render aimed at a world-space point."""
    d = max(2.0, height * 2.1)
    yaw = math.radians(yaw_deg)
    cam.location = mathutils.Vector((
        center[0] + d * math.sin(yaw),
        center[1] - d * math.cos(yaw),
        center[2] + height * 0.75 + d * 0.45,
    ))
    look = mathutils.Vector((center[0], center[1], center[2] + height * 0.45))
    cam.rotation_euler = (look - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = out_png
    bpy.ops.render.render(write_still=True)


def main():
    fresh_scene()
    cam = setup_render_rig()
    report = []
    for i, (name, raw_name, height, tris) in enumerate(ASSETS):
        raw = os.path.join(HERE, raw_name)
        if not os.path.exists(raw):
            report.append('%s: MISSING RAW %s' % (name, raw_name))
            continue
        rot = FORCED_ROT[name]
        if rot is None:
            report.append('%s: NO VERIFIED ROTATION — sweep the raw first' % name)
            continue
        print('=== %s ===' % name)
        meshes = rp.import_raw(raw)
        ob = rp.join_parts(meshes)
        ob.name = name
        img = rp.find_diffuse(ob)
        rp.collapse_material(ob, name + '_Mat', img)
        ang, ax = rot
        if ang:
            ob.data.transform(mathutils.Matrix.Rotation(ang, 4, ax))
        print('  orient: FORCED %s %.0f deg' % (ax, math.degrees(ang)))
        if name == 'Forge_Column':
            # The raw ships a stray horizontal beam through the base. The top
            # 20% z-slab is post-only: take its XY footprint (+0.15 margin)
            # and drop every vertex outside it — beam gone, post intact.
            # (Hard-surface prop with a clean split — verified by render;
            # NOT the bbox-guess deletion the creature rule forbids.)
            vs = ob.data.vertices
            zlo = min(v.co.z for v in vs); zhi = max(v.co.z for v in vs)
            top = [v.co for v in vs if v.co.z > zhi - 0.2 * (zhi - zlo)]
            xa, xb = min(c.x for c in top) - 0.15, max(c.x for c in top) + 0.15
            ya, yb = min(c.y for c in top) - 0.15, max(c.y for c in top) + 0.15
            import bmesh
            bm = bmesh.new()
            bm.from_mesh(ob.data)
            doomed = [v for v in bm.verts
                      if not (xa <= v.co.x <= xb and ya <= v.co.y <= yb)]
            bmesh.ops.delete(bm, geom=doomed, context='VERTS')
            bm.to_mesh(ob.data)
            bm.free()
            print('  column: trimmed %d beam verts' % len(doomed))
        if name == 'Forge_WallStraight':
            # normalize by LENGTH (join rule). Read spans from the vertices —
            # ob.dimensions is STALE right after ob.data.transform().
            vs = ob.data.vertices
            dx = max(v.co.x for v in vs) - min(v.co.x for v in vs)
            dz = max(v.co.z for v in vs) - min(v.co.z for v in vs)
            height = 4.52 * (dz / dx)
        if name == 'Forge_ArchGate':
            # Ring-specific normalize: outer diameter 4.2 (the Ancient World
            # Gate's width), centered, then sunk so the inner aperture's
            # lowest point dips 0.18 under the floor — the walk line through
            # the middle is clear while the rim stays buried at the edges.
            d = ob.dimensions
            s = 4.2 / d.x
            vs = ob.data.vertices
            mn = [min(v.co[i] for v in vs) for i in range(3)]
            mx = [max(v.co[i] for v in vs) for i in range(3)]
            cx, cy, cz = (mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2
            for v in vs:
                v.co.x = (v.co.x - cx) * s
                v.co.y = (v.co.y - cy) * s
                v.co.z = (v.co.z - cz) * s
            inner = min(math.hypot(v.co.x, v.co.z) for v in vs)
            print('  ring: inner R %.2f, sinking center to %.2f' % (inner, inner - 0.18))
            for v in vs:
                v.co.z += inner - 0.18
            height = max(v.co.z for v in vs)  # for the render framing
        else:
            rp.normalize(ob, height)
        final_tris = rp.decimate(ob, tris)

        # Export at origin, park after (baked-offset lesson).
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        coll.objects.link(ob)
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        out_glb = os.path.join(MODELS, name + '.glb')
        bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=True)

        px = i * PARK_STEP
        ob.location.x = px
        coll['export_offset'] = [px, 0, 0]

        render_at(cam, (px, 0, 0), height, os.path.join(RENDERS, name + '_34.png'))
        render_at(cam, (px, 0, 0), height, os.path.join(RENDERS, name + '_rear.png'), yaw_deg=215)
        if name == 'Forge_Golem':
            # face close-up (owner quality gate for anything with a face)
            cam.location = mathutils.Vector((px + 1.1, -1.6, height * 0.82))
            look = mathutils.Vector((px, 0, height * 0.78))
            cam.rotation_euler = (look - cam.location).to_track_quat('-Z', 'Y').to_euler()
            bpy.context.scene.render.filepath = os.path.join(RENDERS, name + '_face.png')
            bpy.ops.render.render(write_still=True)

        dims = ob.dimensions
        report.append('%s: %.2f x %.2f x %.2f  tris %d  glb %.0f KB' % (
            name, dims.x, dims.y, dims.z, final_tris,
            os.path.getsize(out_glb) / 1024))

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'Cinderforge.blend'))
    print('\n'.join(['REPORT:'] + report))


main()
