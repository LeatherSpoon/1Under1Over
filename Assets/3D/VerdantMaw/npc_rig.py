# Rig + animate the three Maw-tender NPCs (breathing-spine plan, Idle only).
# Humanoids arrive posed (arms raised/holding staff), so no arm/leg bones:
# everything binds to a vertical chain; subtle chest/head motion reads alive
# while feet stay planted and posed arms follow the torso rigidly.
# Idempotent: tears down any prior rig/action per character before rebuilding.
import bpy, math, json
from mathutils import Vector, Matrix

assert bpy.data.filepath.endswith('VerdantMaw.blend'), 'WRONG FILE: ' + bpy.data.filepath

scn = bpy.context.scene
scn.render.fps = 24

# key, target height, loop frames, motion params
NPCS = [
    # (key, H, frames, bob*H, spine_x, chest_x, chest_z, pelvis_z, head_x, head_y)
    ('Npc_Sylva', 1.55, 72, 0.006, 1.0, 1.4, 0.8, 0.0, 1.2, 4.0),
    ('Npc_Bram',  1.35, 72, 0.008, 1.6, 2.0, 0.0, 0.5, 1.5, 2.5),
    ('Npc_Sprig', 0.75, 48, 0.012, 1.2, 2.0, 1.0, 0.0, 2.5, 6.0),
]

report = {}
for KEY, TARGET_H, F, BOB, SPX, CHX, CHZ, PVZ, HDX, HDY in NPCS:
    obj = bpy.data.objects[KEY]
    rig_name = KEY + '_Rig'

    # teardown
    old = bpy.data.objects.get(rig_name)
    if old:
        for m in list(obj.modifiers):
            if m.type == 'ARMATURE':
                obj.modifiers.remove(m)
        bpy.data.objects.remove(old, do_unlink=True)
    act = bpy.data.actions.get('Idle_' + KEY)
    if act: bpy.data.actions.remove(act)
    for vg in list(obj.vertex_groups):
        obj.vertex_groups.remove(vg)
    if obj.parent: obj.parent = None

    # normalize: scale to TARGET_H, then bake center-XY + ground into the mesh
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    zs0 = [v.co.z for v in obj.data.vertices]
    s = TARGET_H / (max(zs0) - min(zs0))
    obj.scale = (obj.scale[0] * s, obj.scale[1] * s, obj.scale[2] * s)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    xs = [v.co.x for v in obj.data.vertices]
    ys = [v.co.y for v in obj.data.vertices]
    zs = [v.co.z for v in obj.data.vertices]
    obj.data.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs))))
    obj.data.update()

    for mat in obj.data.materials:
        if mat and mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED':
                    n.inputs['Roughness'].default_value = 1.0
                    n.inputs['Metallic'].default_value = 0.0

    H = TARGET_H

    # armature: vertical chain at the body's standing axis
    arm_data = bpy.data.armatures.new(rig_name)
    rig = bpy.data.objects.new(rig_name, arm_data)
    scn.collection.objects.link(rig)
    rig.location = obj.location
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

    # smooth nearest-segment binding (bone-heat fails on Rodin soup)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_NAME')

    bone_segs = []
    for b in rig.data.bones:
        bone_segs.append((b.name, Vector(b.head_local), Vector(b.tail_local)))
    group_index = {g.name: g.index for g in obj.vertex_groups}
    for name, _, _ in bone_segs:
        if name not in group_index:
            vg = obj.vertex_groups.new(name=name)
            group_index[name] = vg.index
    K = 3
    for v in obj.data.vertices:
        p = v.co  # mesh local == armature local (rig.location == obj.location)
        ds = []
        for name, hd, tl in bone_segs:
            ab = tl - hd
            t = max(0.0, min(1.0, (p - hd).dot(ab) / max(ab.length_squared, 1e-9)))
            d = (p - (hd + ab * t)).length
            ds.append((d, name))
        ds.sort()
        ws = [(1.0 / max(d, 1e-4) ** 4, name) for d, name in ds[:K]]
        tot = sum(w for w, _ in ws)
        for w, name in ws:
            obj.vertex_groups[group_index[name]].add([v.index], w / tot, 'REPLACE')

    # Idle action — vertical bones: local X = nod, local Y = bob/turn, local Z = side-lean
    if rig.animation_data is None:
        rig.animation_data_create()
    idle = bpy.data.actions.new('Idle_' + KEY)
    rig.animation_data.action = idle
    P = rig.pose.bones
    for pb in P:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)

    def key_rot(name, frame, x=None, y=None, z=None):
        pb = P[name]
        e = pb.rotation_euler
        if x is not None: e.x = math.radians(x)
        if y is not None: e.y = math.radians(y)
        if z is not None: e.z = math.radians(z)
        pb.keyframe_insert('rotation_euler', frame=frame)

    def key_bob(frame, d):
        pb = P['pelvis']
        pb.location[1] = d  # local Y = along bone = world up
        pb.keyframe_insert('location', frame=frame)

    h2, q1, q3 = F // 2 + 1, F // 4 + 1, (3 * F) // 4 + 1
    # breath: bob + spine/chest pitch, one cycle per loop
    for f, k in ((1, 0.0), (h2, 1.0), (F, 0.0)):
        key_bob(f, BOB * H * k)
        key_rot('spine', f, x=SPX * k)
    for f, k in ((1, 0.3), (q1, 1.0), (h2, 0.3), (q3, 1.0), (F, 0.3)) if KEY == 'Npc_Sprig' else ((1, 0.0), (h2, 1.0), (F, 0.0)):
        key_rot('chest', f, x=CHX * k)
    # lateral sway / weight shift
    if CHZ:
        for f, k in ((1, -1.0), (h2, 1.0), (F, -1.0)):
            key_rot('chest', f, z=CHZ * k)
    if PVZ:
        for f, k in ((1, -1.0), (h2, 1.0), (F, -1.0)):
            key_rot('pelvis', f, z=PVZ * k)
    # head life: slow look-around (y = turn) + gentle nod (x)
    for f, k in ((1, 0.0), (q1, 1.0), (h2, 0.0), (q3, -1.0), (F, 0.0)):
        key_rot('head', f, y=HDY * k)
    for f, k in ((1, 0.0), (h2, 1.0), (F, 0.0)):
        key_rot('head', f, x=HDX * k)
        key_rot('neck', f, x=HDX * 0.5 * k)

    rig.animation_data.action = None
    for t in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(t)
    tr = rig.animation_data.nla_tracks.new()
    tr.name = idle.name
    tr.strips.new(idle.name, 1, idle)

    report[KEY] = {'bones': len(rig.data.bones), 'verts': len(obj.data.vertices), 'frames': F}

bpy.ops.wm.save_mainfile()
print(json.dumps(report))
