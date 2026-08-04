# build_npcs.py — BOOTSTRAP processor for the 12 zone-resident ambient NPCs
# (text-to-3D raws beside this script -> rigged Idle-only GLBs in models/).
#
#   blender -b --factory-startup --python Assets/3D/ZoneNpcs/build_npcs.py
#
# Labyrinth build_npcs.py recipe (join -> single 512px diffuse -> normalize ->
# decimate -> Maw-tender breathing-spine rig -> Idle NLA -> export at origin),
# with two batch-specific findings:
#   * The raws STAND Z-up facing -Y exactly like the Labyrinth pair — but
#     every character carries a large horizontal TAIL along +Y, so the bbox
#     long axis is Y (1.89) and the dims heuristic lies. Two rotation "fixes"
#     were shipped and reverted before a zero-elevation profile render told
#     the truth: NO rotation is needed. Never orient a character from its
#     bbox; shoot a horizontal profile first.
#   * Those tails also break rp.normalize's bbox XY-centering (the body would
#     stand ~0.6 off its collision circle), so after normalize the mesh is
#     re-centered on the FOOT CENTROID (ground-contact verts, z < 0.12*H —
#     tails don't touch the ground; robe hems do and center correctly).
# (rp.collapse_material already gamma-lifts near-black diffuses; the report's
# diffuse_mean is measured after that.)
#
# ISOLATION IS LOAD-BEARING: every Rodin raw ships identically-named
# materials/images, and the glTF importer DEDUPES them against whatever is
# already in the file — with earlier NPCs parked in-scene, every later import
# re-mapped onto NPC #1's texture (the whole batch shipped wearing the
# Cindersmith's apron once). So each NPC is processed in a fresh empty scene,
# and ZoneNpcs.blend is assembled AFTERWARD by re-importing the finished GLBs
# (their materials are uniquely named by then, so they coexist).
# All 12 are then parked in ZoneNpcs.blend on watcher-convention collections;
# re-running this script OVERWRITES hand edits.
import bpy, os, sys, math, json
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(HERE, '..', 'VerdantMaw'))
import rodin_process as rp

MODELS = r'D:\2Under2Over\models'
RENDERS = os.path.join(HERE, 'renders')
os.makedirs(RENDERS, exist_ok=True)

# (key, height, frames, bob*H, spine_x, chest_x, chest_z, pelvis_z,
#  head_x, head_y) — idle personality per resident: heavy folk breathe slow
# (F 72-96), small quick folk bounce (F 44-56), Snowl gets the owl head-swivel
# (big head_y, near-still body), the Rimeseer is glacial.
NPCS = [
    ('Npc_Cindersmith', 1.55, 72, 0.006, 1.0, 1.4, 0.6, 0.0, 1.2, 3.0),
    ('Npc_Stoker',      1.10, 48, 0.014, 1.6, 2.2, 1.0, 0.5, 2.0, 5.0),
    ('Npc_Tidecaller',  1.50, 84, 0.005, 0.8, 1.2, 0.5, 0.0, 1.0, 4.0),
    ('Npc_Salvager',    1.30, 60, 0.010, 1.3, 1.8, 0.8, 0.3, 1.8, 5.0),
    ('Npc_Tusker',      1.65, 76, 0.006, 0.9, 1.3, 0.5, 0.0, 1.1, 2.5),
    ('Npc_Snowl',       1.30, 88, 0.004, 0.6, 0.9, 0.4, 0.0, 0.8, 6.0),
    ('Npc_Rimeseer',    1.60, 96, 0.003, 0.5, 0.8, 0.3, 0.0, 0.7, 2.0),
    ('Npc_Bonecarver',  1.50, 72, 0.006, 1.0, 1.4, 0.5, 0.0, 1.2, 3.0),
    ('Npc_Mothtender',  1.40, 56, 0.009, 1.2, 1.7, 0.7, 0.3, 1.6, 4.5),
    ('Npc_Glimmer',     0.90, 44, 0.016, 1.8, 2.4, 1.1, 0.6, 2.2, 6.0),
    ('Npc_Deepvark',    1.20, 56, 0.011, 1.4, 1.9, 0.8, 0.4, 1.8, 4.0),
    ('Npc_Geode',       1.30, 68, 0.007, 1.0, 1.5, 0.6, 0.0, 1.3, 3.5),
]

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


def brightness_lift(obj, key):
    """Mean linear brightness of the collapsed diffuse; gamma-lift if < 0.12."""
    img = None
    for slot in obj.material_slots:
        mat = slot.material
        if not (mat and mat.use_nodes):
            continue
        for n in mat.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image:
                img = n.image
                break
    if img is None:
        return None, False
    px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
    mean = float(px[:, :3].mean())
    lifted = False
    if mean < 0.12:
        px[:, :3] = px[:, :3] ** 0.6
        img.pixels[:] = px.reshape(-1).tolist()
        img.pack()
        lifted = True
    return round(mean, 4), lifted


report = {}
for i, (KEY, H, F, BOB, SPX, CHX, CHZ, PVZ, HDX, HDY) in enumerate(NPCS):
    raw = os.path.join(HERE, 'rodin_%s_raw.glb' % KEY)
    print('=== %s ===' % KEY)
    bpy.ops.wm.read_homefile(use_empty=True)  # isolation — see header
    cam = setup_render_rig()
    meshes = rp.import_raw(raw)
    obj = rp.join_parts(meshes)
    obj.name = KEY
    img = rp.find_diffuse(obj)
    rp.collapse_material(obj, KEY + '_Mat', img)
    rp.normalize(obj, H)
    # Foot-centroid recenter (see header): stand the BODY on the origin, not
    # the body+tail bbox center. Ground band = z < 0.12*H.
    feet = [v.co for v in obj.data.vertices if v.co.z < 0.12 * H]
    if feet:
        fx = sum(v.x for v in feet) / len(feet)
        fy = sum(v.y for v in feet) / len(feet)
        obj.data.transform(Matrix.Translation(Vector((-fx, -fy, 0))))
    tris = rp.decimate(obj, 9000)
    obj.location = (0, 0, 0)
    mean_b, lifted = brightness_lift(obj, KEY)

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

    report[KEY] = {'tris': tris, 'kb': size_kb, 'bones': len(rig.data.bones),
                   'frames': F, 'diffuse_mean': mean_b, 'lifted': lifted}

# ── Assemble ZoneNpcs.blend from the FINISHED GLBs (watcher convention) ──────
# Re-importing the exports (uniquely-named materials now) sidesteps the raw
# name-dedup trap; each NPC parks at i*60 in its own collection.
bpy.ops.wm.read_homefile(use_empty=True)
for i, row in enumerate(NPCS):
    KEY = row[0]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, KEY + '.glb'))
    new = [o for o in set(bpy.data.objects) - before]
    rig = next((o for o in new if o.type == 'ARMATURE'), None)
    # glTF import may leave the Idle as the active action with no NLA track;
    # the owner-edit watcher exports NLA_TRACKS, so push it onto a track.
    if rig and rig.animation_data:
        ad = rig.animation_data
        if ad.action and not ad.nla_tracks:
            act = ad.action
            ad.action = None
            tr = ad.nla_tracks.new()
            tr.name = act.name
            tr.strips.new(act.name, 1, act)
    coll = bpy.data.collections.new(KEY)
    bpy.context.scene.collection.children.link(coll)
    coll['export_offset'] = [-(i * 60), 0, 0]
    root = rig if rig else (new[0] if new else None)
    if root:
        root.location.x += i * 60
    for ob in new:
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        coll.objects.link(ob)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'ZoneNpcs.blend'))
print('REPORT ' + json.dumps(report))
