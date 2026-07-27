# rig_duskdart.py — normalize, rig and export the Duskdart canopy tree gecko
# (Rodin import 'Duskdart' in the scene, upright, facing -Y at yaw 0).
#
# Quad plan (tundra recipe): horizontal Root(hips)->Spine->Neck->Head chain,
# four legs from ground-contact clusters, two tail bones out through the
# spiral curl. Clips authored parametrically, NLA tracks named exactly
# Idle/Walk (datablocks 'Idle_Duskdart'/'Walk_Duskdart').
# Export: models/Duskdart.glb, NLA_TRACKS, diffuse-only material.
import bpy, math, os, traceback
from mathutils import Vector

FPS = 24
TWO_PI = 2 * math.pi
scn = bpy.context.scene
scn.render.fps = FPS
H_TARGET = 0.55

def seg_dist(p, a, b):
    ab = b - a
    L2 = ab.length_squared
    if L2 < 1e-12: return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / L2))
    return (p - (a + ab * t)).length

def ground_clusters(verts, zmax, tol):
    pts = [v for v in verts if v.z < zmax]
    clusters = []
    for p in pts:
        best, bd = None, tol
        for c in clusters:
            d = (Vector((p.x, p.y, 0)) - c[0] / c[1]).length
            if d < bd: bd, best = d, c
        if best is None: clusters.append([Vector((p.x, p.y, 0)), 1])
        else: best[0] += Vector((p.x, p.y, 0)); best[1] += 1
    return sorted([(c[1], c[0] / c[1]) for c in clusters], reverse=True, key=lambda x: x[0])

def detect_feet(verts, H):
    cl = ground_clusters(verts, 0.14 * H, 0.13)
    centers = [c for _, c in cl[:6]]
    if len(centers) < 3: return None
    xs = sorted(p.x for p in centers)
    ys = sorted(p.y for p in centers)
    x_med = (xs[len(xs)//2 - 1] + xs[len(xs)//2]) / 2 if len(xs) % 2 == 0 else xs[len(xs)//2]
    y_med = (ys[len(ys)//2 - 1] + ys[len(ys)//2]) / 2 if len(ys) % 2 == 0 else ys[len(ys)//2]
    quad = {}
    for _, c in cl[:6]:
        key = ('F' if c.y < y_med else 'B') + ('L' if c.x < x_med else 'R')
        if key not in quad: quad[key] = c
    for a, b in (('FL', 'FR'), ('BL', 'BR')):
        if a in quad and b not in quad: quad[b] = Vector((2 * x_med - quad[a].x, quad[a].y, 0))
        if b in quad and a not in quad: quad[a] = Vector((2 * x_med - quad[b].x, quad[b].y, 0))
    return quad if len(quad) == 4 else None

try:
    dd = bpy.data.objects['Duskdart']
    dd.rotation_mode = 'XYZ'

    # Material: diffuse-only
    m = dd.material_slots[0].material
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Roughness'].default_value = 1.0
    b.inputs['Metallic'].default_value = 0.0
    for n in list(nt.nodes):
        if n.type == 'TEX_IMAGE' and n.image and 'diffuse' not in n.image.name: nt.nodes.remove(n)
        elif n.type == 'NORMAL_MAP': nt.nodes.remove(n)
    m.name = 'DuskdartSkin'

    # Normalize BEFORE parenting: apply, scale to H_TARGET, ground, center
    bpy.ops.object.select_all(action='DESELECT')
    dd.select_set(True); bpy.context.view_layer.objects.active = dd
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    vs = [v.co for v in dd.data.vertices]
    h = max(v.z for v in vs) - min(v.z for v in vs)
    s = H_TARGET / h
    dd.scale = (s, s, s)
    bpy.ops.object.transform_apply(scale=True)
    vs = [v.co.copy() for v in dd.data.vertices]
    minx, maxx = min(v.x for v in vs), max(v.x for v in vs)
    miny, maxy = min(v.y for v in vs), max(v.y for v in vs)
    minz = min(v.z for v in vs)
    dd.location = (-(minx + maxx) / 2, -(miny + maxy) / 2, -minz)
    bpy.ops.object.transform_apply(location=True)

    verts = [v.co.copy() for v in dd.data.vertices]
    H = max(v.z for v in verts)
    ymin = min(v.y for v in verts)

    feet = detect_feet(verts, H)
    if feet is None:
        L = max(v.y for v in verts) - ymin
        yc = ymin + L / 2
        feet = {k: Vector((sx * 0.16, yc + sy * 0.24 * L, 0)) for k, (sx, sy) in
                {'FL': (-1, -1), 'FR': (1, -1), 'BL': (-1, 1), 'BR': (1, 1)}.items()}
    yF = (feet['FL'].y + feet['FR'].y) / 2
    yB = (feet['BL'].y + feet['BR'].y) / 2
    hips = Vector((0, yB, 0.5 * H))
    chest = Vector((0, yF, 0.52 * H))
    headbase = Vector((0, max(ymin + 0.2 * (yF - ymin), yF - 0.1), 0.68 * H))
    nose = Vector((0, ymin + 0.03, 0.55 * H))
    # tail: the spiral curl — furthest vert from the hips that is behind them
    # OR far out to a side (the curl sweeps sideways on this gen)
    behind = [v for v in verts if v.y > yB + 0.04 or abs(v.x) > 0.45]
    tip = max(behind, key=lambda v: (v - hips).length) if behind else Vector((0, yB + 0.3, 0.4 * H))
    tip = Vector((tip.x, tip.y, max(tip.z, 0.2 * H)))
    tmid = hips.lerp(tip, 0.5)

    bones = [
        ('Root', hips, hips + Vector((0, 0.1, 0)), None),
        ('Spine', hips, chest, 'Root'),
        ('Neck', chest, headbase, 'Spine'),
        ('Head', headbase, nose, 'Neck'),
        ('Tail1', hips, tmid, 'Root'),
        ('Tail2', tmid, tip, 'Tail1'),
    ]
    for leg, parent in (('FL', 'Spine'), ('FR', 'Spine'), ('BL', 'Root'), ('BR', 'Root')):
        fx, fy = feet[leg].x, feet[leg].y
        bones += [('UpLeg.' + leg, Vector((fx, fy, 0.42 * H)), Vector((fx, fy, 0.2 * H)), parent),
                  ('LoLeg.' + leg, Vector((fx, fy, 0.2 * H)), Vector((fx, fy, 0.02)), 'UpLeg.' + leg)]

    arm_data = bpy.data.armatures.new('Duskdart_Arm')
    arm = bpy.data.objects.new('Duskdart_Rig', arm_data)
    scn.collection.objects.link(arm)
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    ebs = {}
    for bname, head, tail, parent in bones:
        eb = arm_data.edit_bones.new(bname)
        eb.head, eb.tail = head, tail
        if parent: eb.parent = ebs[parent]
        ebs[bname] = eb
    bpy.ops.object.mode_set(mode='OBJECT')

    segs = {bn[0]: (Vector(bn[1]), Vector(bn[2])) for bn in bones}
    groups = {n: dd.vertex_groups.new(name=n) for n in segs}
    names = list(segs.keys())
    for v in dd.data.vertices:
        ds = sorted(((seg_dist(v.co, *segs[n]), n) for n in names))[:2]
        ws = [(1.0 / (d + 1e-4)) ** 4 for d, _ in ds]
        tot = sum(ws)
        for (d, n), w in zip(ds, ws):
            groups[n].add([v.index], w / tot, 'REPLACE')
    mod = dd.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    dd.parent = arm
    dd.matrix_parent_inverse = arm.matrix_world.inverted()

    def author(cname, nframes, pose_fn):
        act = bpy.data.actions.new(cname)
        act.use_fake_user = True
        act['clip'] = 'Idle' if 'Idle' in cname else 'Walk'
        adt = arm.animation_data or arm.animation_data_create()
        adt.action = act
        if hasattr(act, 'slots'):
            try: slot = act.slots.new(id_type='OBJECT', name=arm.name)
            except TypeError: slot = act.slots.new('OBJECT', arm.name)
            try: adt.action_slot = slot
            except Exception: pass
        for pb in arm.pose.bones: pb.rotation_mode = 'XYZ'
        for f in range(1, nframes + 2, 2):
            t = ((f - 1) % nframes) / nframes
            for pb in arm.pose.bones:
                pb.rotation_euler = (0, 0, 0)
                if pb.name == 'Root': pb.location = (0, 0, 0)
            pose_fn(arm.pose.bones, t)
            for pb in arm.pose.bones:
                pb.keyframe_insert('rotation_euler', frame=f)
                if pb.name == 'Root': pb.keyframe_insert('location', frame=f)
        return act

    def idle(pbs, t):
        sb = math.sin(TWO_PI * t)
        pbs['Root'].location = (0, 0, 0.006 * sb)
        pbs['Spine'].rotation_euler = (0.025 * sb, 0, 0)
        pbs['Head'].rotation_euler = (0.05 * math.sin(TWO_PI * t + 0.8), 0, 0.07 * math.sin(TWO_PI * t * 0.5))
        pbs['Tail1'].rotation_euler = (0, 0, 0.16 * sb)
        pbs['Tail2'].rotation_euler = (0, 0, 0.24 * math.sin(TWO_PI * t - 0.9))

    def walk(pbs, t):
        sb = math.sin(TWO_PI * t)
        for leg, ph in (('FL', 0.0), ('BR', 0.0), ('FR', 0.5), ('BL', 0.5)):
            sw = math.sin(TWO_PI * (t + ph))
            lift = max(0.0, math.sin(TWO_PI * (t + ph) + 0.7))
            pbs['UpLeg.' + leg].rotation_euler = (0.5 * sw, 0, 0)
            pbs['LoLeg.' + leg].rotation_euler = (0.45 * lift, 0, 0)
        pbs['Root'].location = (0, 0, 0.012 * abs(math.sin(TWO_PI * t * 2)))
        pbs['Root'].rotation_euler = (0, 0.05 * sb, 0)
        pbs['Spine'].rotation_euler = (0.03 * math.sin(TWO_PI * t * 2), 0, 0)
        pbs['Head'].rotation_euler = (0.06 * math.sin(TWO_PI * t * 2 + 1.0), 0, 0)
        pbs['Tail1'].rotation_euler = (0, 0, 0.26 * sb)
        pbs['Tail2'].rotation_euler = (0, 0, 0.32 * math.sin(TWO_PI * t - 0.8))

    acts = [author('Idle_Duskdart', 48, idle), author('Walk_Duskdart', 24, walk)]
    adt = arm.animation_data
    adt.action = None
    for act in acts:
        cname = act['clip']
        tr = adt.nla_tracks.new()
        tr.name = cname
        st = tr.strips.new(cname, 1, act)
        st.name = cname
        if hasattr(st, 'action_slot') and hasattr(act, 'slots') and len(act.slots):
            try: st.action_slot = act.slots[0]
            except Exception: pass

    bpy.ops.object.select_all(action='DESELECT')
    dd.select_set(True); arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    path = os.path.join(r'D:\1Under1OverToo\models', 'Duskdart.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_animation_mode='NLA_TRACKS')
    bpy.ops.wm.save_as_mainfile(filepath=r'D:\1Under1OverToo\Assets\3D\VerdantMaw\Duskdart.blend')
    result = {'kb': round(os.path.getsize(path) / 1024, 1), 'H': round(H, 3),
              'feet': {k: [round(v.x, 2), round(v.y, 2)] for k, v in feet.items()}, 'bones': len(bones)}
    print('DUSKDART_OK ' + str(result))
except Exception:
    result = 'FAIL: ' + traceback.format_exc()[-1500:]
    print(result)
