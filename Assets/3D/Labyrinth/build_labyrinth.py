# build_labyrinth.py — BOOTSTRAP processor for the ancient-stone-maze kit.
#
#   blender -b --factory-startup --python Assets/3D/Labyrinth/build_labyrinth.py
#
# Imports each rodin_Lab_*_raw.glb beside this script, runs the shared Rodin
# recipe (join -> single 512px diffuse -> orient by slab test -> normalize ->
# decimate), exports models/<Name>.glb, then parks the asset on its own row of
# Labyrinth.blend with a matching collection 'export_offset' so the blend rides
# the watch-assets owner-edit path. Re-running OVERWRITES hand edits — once the
# .blend is hand-edited, it is the source of truth (see export_blend.py).
import bpy, os, sys, math, mathutils

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(HERE, '..', 'VerdantMaw'))
import rodin_process as rp

MODELS = r'D:\1Under1OverToo\models'
RENDERS = os.path.join(HERE, 'renders')
os.makedirs(RENDERS, exist_ok=True)

# name -> (target height, decimate tris). Walls instance heavily -> lean.
ASSETS = [
    ('Lab_WallStraight', 2.8, 8000),
    ('Lab_WallCorner',   2.8, 6000),
    ('Lab_ArchGate',     3.4, 8000),
    ('Lab_Minotaur',     3.2, 10000),
    # Lab_Sentinel: dropped after 3 text-to-3D strikes (garbled / lying /
    # headless-with-beam-sword). Raw kept; retry via image-to-3D with a
    # Leonardo concept if the kit wants a second statue.
    ('Lab_Brazier',      1.2, 6000),
    ('Lab_RuneStele',    1.6, 5000),
    ('Lab_BrokenColumn', 2.0, 6000),
    ('Lab_Rubble',       0.7, 6000),
    ('Lab_Shrine',       2.0, 8000),
    # batch 2 (2026-07-29)
    ('Lab_Fountain',     1.8, 8000),
    ('Lab_Gargoyle',     1.6, 8000),
    ('Lab_Pedestal',     1.3, 5000),
    ('Lab_Well',         2.0, 6000),
    ('Lab_TombChest',    1.3, 6000),  # 'sarcophagus' gen came back a square peaked-lid tomb chest — kept, renamed
    ('Lab_BullSkull',    1.2, 6000),
    ('Lab_SpikeTrap',    0.9, 6000),  # the 'portcullis' gen came back a spike pit — kept as a trap
    ('Lab_Lever',        1.0, 5000),
    ('Lab_Column',       3.0, 6000),
    ('Lab_Bones',        0.4, 5000),
]
PARK_STEP = 60  # units between parked assets along +X

# Render-sweep verified rotations (mesh-space, applied INSTEAD of the slab
# test, which the sweep proved wrong for these): name -> (angle_rad, axis).
FORCED_ROT = {
    'Lab_WallStraight': (math.pi / 2, 'X'),
    'Lab_ArchGate': (math.pi / 2, 'X'),     # hex door frame stands up
    'Lab_RuneStele': (math.pi / 2, 'X'),    # tablet stands up, carved face -Y
    'Lab_Minotaur': (0, 'X'),               # identity is correct; slab test unreliable here
    'Lab_Sentinel': (0, 'X'),               # kneeling headless knight; identity correct
    # batch 2 (sweep-verified 2026-07-29)
    'Lab_Fountain': (0, 'X'),
    'Lab_Gargoyle': (0, 'X'),
    'Lab_Well': (0, 'X'),
    'Lab_BullSkull': (-math.pi / 2, 'X'),   # rests on jaw, forehead up
    'Lab_SpikeTrap': (0, 'X'),
    'Lab_Lever': (0, 'X'),
    'Lab_Column': (0, 'X'),
    'Lab_Bones': (math.pi / 2, 'X'),        # shield lies flat, bones on top
    'Lab_Pedestal': (0, 'X'),
    'Lab_TombChest': (0, 'X'),
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
    for i, (name, height, tris) in enumerate(ASSETS):
        raw = os.path.join(HERE, 'rodin_%s_raw.glb' % name)
        if not os.path.exists(raw):
            report.append('%s: MISSING RAW' % name)
            continue
        print('=== %s ===' % name)
        meshes = rp.import_raw(raw)
        ob = rp.join_parts(meshes)
        ob.name = name
        img = rp.find_diffuse(ob)
        rp.collapse_material(ob, name + '_Mat', img)
        if name in FORCED_ROT:
            ang, ax = FORCED_ROT[name]
            if ang:
                ob.data.transform(mathutils.Matrix.Rotation(ang, 4, ax))
            print('  orient: FORCED %s %.0f deg' % (ax, math.degrees(ang)))
        else:
            rp.orient_upright(ob)
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
        if name == 'Lab_Minotaur':
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

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'Labyrinth.blend'))
    print('\n'.join(['REPORT:'] + report))


main()
