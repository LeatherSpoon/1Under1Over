# build_npcs.py — BOOTSTRAP processor for the Labyrinth's two ambient NPCs
# (text-to-3D raws beside this script -> rigged Idle-only GLBs in models/).
#
#   blender -b --factory-startup --python Assets/3D/Labyrinth/build_npcs.py
#
# Shared Rodin recipe (join -> single 512px diffuse -> orient by slab test ->
# normalize -> decimate), then the Maw-tender breathing-spine rig (vertical
# chain, Idle NLA track only — env._addNpc plays /idle/i), exported at the
# origin so bind state == export state (npc_export3.py lesson). Both NPCs are
# then parked in LabNpcs.blend on watcher-convention collections so the owner
# can hand-edit; re-running this script OVERWRITES those edits.
import bpy, os, sys, math, json
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(HERE, '..', 'VerdantMaw'))
import rodin_process as rp

MODELS = r'D:\2Under2Over\models'
RENDERS = os.path.join(HERE, 'renders')
os.makedirs(RENDERS, exist_ok=True)

# (key, raw, height, frames, bob*H, spine_x, chest_x, chest_z, pelvis_z,
#  head_x, head_y, yaw_fix) — yaw_fix rotates about Z so the character faces
# Blender -Y (= game +z after yup export); verified by render sweep.
# The slab test is SKIPPED for characters: both raws stand Z-up already, and
# the test read their flat robe fronts as bases and laid them face-down
# (same misread as 5 of 10 kit raws — build_labyrinth.py FORCED_ROT lesson).
NPCS = [
    ('Npc_Warden', 'rodin_Lab_NpcWarden_raw.glb', 1.5, 72,
     0.006, 1.0, 1.4, 0.6, 0.0, 1.2, 3.0, 0.0),
    ('Npc_Delver', 'rodin_Lab_NpcDelver_raw.glb', 0.95, 56,
     0.012, 1.4, 2.0, 0.8, 0.4, 2.2, 6.0, 0.0),
]

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
    bpy.context.scene.render.resolution_x = 512
    bpy.context.scene.render.resolution_y = 512
    return cam


def render_at(cam, center, height, out_png, yaw_deg, dist_mult=2.1, look_up=0.45):
    d = max(1.2, height * dist_mult)
    yaw = math.radians(yaw_deg)
    cam.location = Vector((center[0] + d * math.sin(yaw),
                           center[1] - d * math.cos(yaw),
                           center[2] + height * 0.6 + d * 0.35))
    look = Vector((center[0], center[1], center[2] + height * look_up))
    cam.rotation_euler = (look - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = out_png
    bpy.ops.render.render(write_still=True)


cam = setup_render_rig()
report = {}
parked = []
for i, (KEY, RAW, H, F, BOB, SPX, CHX, CHZ, PVZ, HDX, HDY, YAW) in enumerate(NPCS):
    raw = os.path.join(HERE, RAW)
    print('=== %s ===' % KEY)
    meshes = rp.import_raw(raw)
    obj = rp.join_parts(meshes)
    obj.name = KEY
    img = rp.find_diffuse(obj)
    rp.collapse_material(obj, KEY + '_Mat', img)
    if YAW:
        obj.data.transform(Matrix.Rotation(YAW, 4, 'Z'))
    rp.normalize(obj, H)
    tris = rp.decimate(obj, 9000)
    obj.location = (0, 0, 0)

    # ── Breathing-spine rig (Maw-tender plan: vertical chain, Idle only) ──
    scn = bpy.context.scene
    scn.render.fps = 24
    rig_name = KEY + '_Rig'
    arm_data = bpy.data.armatures.new(rig_name)
    rig = bpy.data.objects.new(rig_name, arm_data)
    scn.collection.objects.link(rig)
    rig.location = (0, 0, 0)
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones

    def bone(name, z0, z1, parent=None):
        b = eb.new(name)
        b.head = Vector((0, 0, z0 * H))
        b.tail = Vector((0, 0, z1 * H))
        if parent is not None:
            b.parent = eb[parent]
            b.use_connect = True
        return b

    bone('root',   0.00, 0.30)
    bone('pelvis', 0.30, 0.48, 'root')
    bone('spine',  0.48, 0.66, 'pelvis')
    bone('chest',  0.66, 0.82, 'spine')
    bone('neck',   0.82, 0.90, 'chest')
    bone('head',   0.90, 1.00, 'neck')
    bpy.ops.object.mode_set(mode='OBJECT')

    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_NAME')

    bone_segs = [(b.name, Vector(b.head_local), Vector(b.tail_local))
                 for b in rig.data.bones]
    group_index = {g.name: g.index for g in obj.vertex_groups}
    for name, _, _ in bone_segs:
        if name not in group_index:
            vg = obj.vertex_groups.new(name=name)
            group_index[name] = vg.index
    K = 3
    for v in obj.data.vertices:
        p = v.co
        ds = []
        for name, hd, tl in bone_segs:
            ab = tl - hd
            t = max(0.0, min(1.0, (p - hd).dot(ab) / max(ab.length_squared, 1e-9)))
            ds.append(((p - (hd + ab * t)).length, name))
        ds.sort()
        ws = [(1.0 / max(d, 1e-4) ** 4, name) for d, name in ds[:K]]
        tot = sum(w for w, _ in ws)
        for w, name in ws:
            obj.vertex_groups[group_index[name]].add([v.index], w / tot, 'REPLACE')

    # ── Idle action → NLA track (name matches /idle/i in Enemy/env players) ──
    rig.animation_data_create()
    idle = bpy.data.actions.new('Idle_' + KEY)
    rig.animation_data.action = idle
    P = rig.pose.bones
    for pb in P:
        pb.rotation_mode = 'XYZ'

    def key_rot(name, frame, x=None, y=None, z=None):
        pb = P[name]
        e = pb.rotation_euler
        if x is not None: e.x = math.radians(x)
        if y is not None: e.y = math.radians(y)
        if z is not None: e.z = math.radians(z)
        pb.keyframe_insert('rotation_euler', frame=frame)

    def key_bob(frame, d):
        pb = P['pelvis']
        pb.location[1] = d
        pb.keyframe_insert('location', frame=frame)

    h2, q1, q3 = F // 2 + 1, F // 4 + 1, (3 * F) // 4 + 1
    for f, k in ((1, 0.0), (h2, 1.0), (F, 0.0)):
        key_bob(f, BOB * H * k)
        key_rot('spine', f, x=SPX * k)
        key_rot('chest', f, x=CHX * k)
    if CHZ:
        for f, k in ((1, -1.0), (h2, 1.0), (F, -1.0)):
            key_rot('chest', f, z=CHZ * k)
    if PVZ:
        for f, k in ((1, -1.0), (h2, 1.0), (F, -1.0)):
            key_rot('pelvis', f, z=PVZ * k)
    for f, k in ((1, 0.0), (q1, 1.0), (h2, 0.0), (q3, -1.0), (F, 0.0)):
        key_rot('head', f, y=HDY * k)
    for f, k in ((1, 0.0), (h2, 1.0), (F, 0.0)):
        key_rot('head', f, x=HDX * k)
        key_rot('neck', f, x=HDX * 0.5 * k)

    rig.animation_data.action = None
    tr = rig.animation_data.nla_tracks.new()
    tr.name = idle.name
    tr.strips.new(idle.name, 1, idle)

    # ── Export at the origin (bind state == export state) ────────────────────
    for o in bpy.data.objects:
        o.select_set(o in (obj, rig))
    bpy.context.view_layer.objects.active = rig
    out = os.path.join(MODELS, KEY + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=out, export_format='GLB', use_selection=True,
        export_animations=True, export_animation_mode='NLA_TRACKS')
    size_kb = os.path.getsize(out) // 1024

    # ── Verification renders: 4 yaws + face close-up ─────────────────────────
    for yaw in (0, 90, 180, 270):
        render_at(cam, (0, 0, 0), H, os.path.join(RENDERS, '%s_y%03d.png' % (KEY, yaw)), yaw)
    render_at(cam, (0, 0, 0), H, os.path.join(RENDERS, '%s_face.png' % KEY),
              0, dist_mult=0.9, look_up=0.85)

    # park for the .blend save (mesh follows its rig parent — move rig only)
    rig.location = (i * 60, 0, 0)
    parked.append((KEY, obj, rig))
    report[KEY] = {'tris': tris, 'kb': size_kb, 'bones': len(rig.data.bones), 'frames': F}

# watcher-convention collections so the owner can edit + auto-re-export
for KEY, obj, rig in parked:
    coll = bpy.data.collections.new(KEY)
    bpy.context.scene.collection.children.link(coll)
    coll['export_offset'] = [-rig.location.x, -rig.location.y, -rig.location.z]
    for ob in (obj, rig):
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        coll.objects.link(ob)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'LabNpcs.blend'))
print('REPORT ' + json.dumps(report))
