# Rig + animate the four Glacial Hollow cave creatures in GlacialHollow.blend.
#
# Same pipeline as Assets/3D/FrozenTundra/rig_creatures.py (read that first —
# it documents the why). Meshes must already be normalized: grounded z=0,
# centered XY, facing -y, final native scale.
#
#   Rimeburrow  quad   — shaggy mole-badger, heavy plodding gait
#   Shardback   quad   — crystal-plated pangolin, slow armored gait, 2-bone tail
#   Cryolisk    quad   — low sprawling salamander, wide tail sweep
#   Chillwing   biped  — upright cave bat: legs + folded wings + tail
#
# Actions are named '<Clip>_<Key>' because Blender's action namespace is
# file-global and four rigs share this file; the NLA *track* is what glTF
# NLA_TRACKS mode exports as the animation name, so tracks stay 'Idle'/'Walk'
# (Enemy.js matches /idle/i and /walk/i).
import bpy, math, json
from mathutils import Vector

FPS = 24
scn = bpy.context.scene
scn.render.fps = FPS
TWO_PI = 2 * math.pi


def seg_dist(p, a, b):
    ab = b - a
    L2 = ab.length_squared
    if L2 < 1e-12:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / L2))
    return (p - (a + ab * t)).length


def ground_clusters(verts, zmax, tol):
    pts = [v for v in verts if v.z < zmax]
    clusters = []
    for p in pts:
        best, bd = None, tol
        for c in clusters:
            d = (Vector((p.x, p.y, 0)) - c[0] / c[1]).length
            if d < bd:
                bd, best = d, c
        if best is None:
            clusters.append([Vector((p.x, p.y, 0)), 1])
        else:
            best[0] += Vector((p.x, p.y, 0))
            best[1] += 1
    return sorted([(c[1], c[0] / c[1]) for c in clusters], reverse=True, key=lambda x: x[0])


def detect_feet(verts, H):
    cl = ground_clusters(verts, 0.13 * H, 0.14)
    centers = [c for _, c in cl[:6]]
    if len(centers) < 4:
        return None
    xs = sorted(p.x for p in centers)
    ys = sorted(p.y for p in centers)
    x_med = xs[len(xs) // 2] if len(xs) % 2 else (xs[len(xs)//2 - 1] + xs[len(xs)//2]) / 2
    y_med = ys[len(ys) // 2] if len(ys) % 2 else (ys[len(ys)//2 - 1] + ys[len(ys)//2]) / 2
    quad = {}
    for _, c in cl[:6]:
        key = ('F' if c.y < y_med else 'B') + ('L' if c.x < x_med else 'R')
        if key not in quad:
            quad[key] = c
    for a, b in (('FL', 'FR'), ('BL', 'BR')):
        if a in quad and b not in quad:
            quad[b] = Vector((-quad[a].x + 2 * x_med, quad[a].y, 0))
        if b in quad and a not in quad:
            quad[a] = Vector((-quad[b].x + 2 * x_med, quad[b].y, 0))
    return quad if len(quad) >= 4 else None


def build_armature(name, bone_specs, loc):
    arm_data = bpy.data.armatures.new(name + '_Arm')
    arm = bpy.data.objects.new(name + '_Rig', arm_data)
    scn.collection.objects.link(arm)
    arm.location = loc
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    ebs = {}
    for bname, head, tail, parent in bone_specs:
        eb = arm_data.edit_bones.new(bname)
        eb.head, eb.tail = head, tail
        if parent:
            eb.parent = ebs[parent]
        ebs[bname] = eb
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def skin_mesh(mesh_obj, arm, bone_specs):
    """Nearest-bone-segment weights (K=2, 1/d^4). Bone-heat always fails on
    Rodin soup (non-manifold shards), so ARMATURE_AUTO is never attempted."""
    segs = {b[0]: (Vector(b[1]), Vector(b[2])) for b in bone_specs}
    groups = {bname: mesh_obj.vertex_groups.new(name=bname) for bname in segs}
    names = list(segs.keys())
    for v in mesh_obj.data.vertices:
        p = v.co
        ds = sorted(((seg_dist(p, *segs[n]), n) for n in names))[:2]
        ws = [(1.0 / (d + 1e-4)) ** 4 for d, _ in ds]
        tot = sum(ws)
        for (d, n), w in zip(ds, ws):
            groups[n].add([v.index], w / tot, 'REPLACE')
    mod = mesh_obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    mesh_obj.parent = arm
    mesh_obj.matrix_parent_inverse = arm.matrix_world.inverted()


def author_clip(arm, track, key, nframes, pose_fn):
    act = bpy.data.actions.new(track + '_' + key)
    act.use_fake_user = True
    act['clip'] = track                      # NLA track name -> glTF clip name
    adt = arm.animation_data or arm.animation_data_create()
    adt.action = act
    if hasattr(act, 'slots'):                # Blender 5.x slotted actions
        try:
            slot = act.slots.new(id_type='OBJECT', name=arm.name)
        except TypeError:
            slot = act.slots.new('OBJECT', arm.name)
        try:
            adt.action_slot = slot
        except Exception:
            pass
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
    for f in range(1, nframes + 2, 2):
        t = ((f - 1) % nframes) / nframes
        for pb in arm.pose.bones:
            pb.rotation_euler = (0, 0, 0)
            if pb.name == 'Root':
                pb.location = (0, 0, 0)
        pose_fn(arm.pose.bones, t)
        for pb in arm.pose.bones:
            pb.keyframe_insert('rotation_euler', frame=f)
            if pb.name == 'Root':
                pb.keyframe_insert('location', frame=f)
    return act


def push_nla(arm, acts):
    adt = arm.animation_data
    adt.action = None
    for act in acts:
        cname = act.get('clip', act.name)
        tr = adt.nla_tracks.new()
        tr.name = cname
        st = tr.strips.new(cname, 1, act)
        st.name = cname
        if hasattr(st, 'action_slot') and hasattr(act, 'slots') and len(act.slots):
            try:
                st.action_slot = act.slots[0]
            except Exception:
                pass


report = []

# Idempotent re-run: drop any rig this script made previously, un-parent the
# meshes and clear their vertex groups/modifiers so feet detection sees a
# clean mesh again.
for key in ('Rimeburrow', 'Shardback', 'Cryolisk', 'Chillwing'):
    mesh = bpy.data.objects.get('Creature_' + key)
    if mesh:
        mesh.parent = None
        mesh.matrix_parent_inverse.identity()
        for m in list(mesh.modifiers):
            if m.type == 'ARMATURE':
                mesh.modifiers.remove(m)
        mesh.vertex_groups.clear()
    old = bpy.data.objects.get('Creature_' + key + '_Rig')
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
for act in list(bpy.data.actions):
    if act.name.startswith(('Idle_', 'Walk_')):
        bpy.data.actions.remove(act)

# Feet the cluster pass gets wrong. Cryolisk's front-right leg merges into the
# belly blob, so detection puts it on the centreline (x~0.007) and the rig
# animates a one-legged front end — mirror it from the front-left instead.
FEET_OVERRIDE = {
    'Creature_Cryolisk': {'FR': Vector((0.089, -0.172, 0))},
}

# ── Quadrupeds ───────────────────────────────────────────────────────────────
QUADS = {
    'Creature_Rimeburrow': {   # heavy shaggy digger — short stride, low bob
        'swingA': 0.40, 'kneeB': 0.34, 'bob': 0.012, 'tail2': False,
        'idle_tail': 0.06, 'walk_tail': 0.10, 'headbob': 0.06,
    },
    'Creature_Shardback': {    # armored plates — slow, minimal vertical motion
        'swingA': 0.28, 'kneeB': 0.26, 'bob': 0.008, 'tail2': True,
        'idle_tail': 0.10, 'walk_tail': 0.16, 'headbob': 0.04,
    },
    'Creature_Cryolisk': {     # sprawling salamander — big tail sweep
        'swingA': 0.52, 'kneeB': 0.44, 'bob': 0.008, 'tail2': True,
        'idle_tail': 0.22, 'walk_tail': 0.36, 'headbob': 0.05,
    },
}

for name, P in QUADS.items():
    o = bpy.data.objects[name]
    verts = [v.co.copy() for v in o.data.vertices]
    H = max(v.z for v in verts)
    ymin = min(v.y for v in verts)
    ymax = max(v.y for v in verts)
    feet = detect_feet(verts, H)
    if feet is None:
        L = ymax - ymin
        yc = (ymax + ymin) / 2
        feet = {k: Vector((sx * 0.16, yc + sy * 0.28 * L, 0)) for k, (sx, sy) in
                {'FL': (-1, -1), 'FR': (1, -1), 'BL': (-1, 1), 'BR': (1, 1)}.items()}
    feet.update(FEET_OVERRIDE.get(name, {}))
    yF = (feet['FL'].y + feet['FR'].y) / 2
    yB = (feet['BL'].y + feet['BR'].y) / 2
    hips = Vector((0, yB, 0.52 * H))
    chest = Vector((0, yF, 0.55 * H))
    headbase = Vector((0, max(ymin + 0.22 * (yF - ymin), yF - 0.12), 0.74 * H))
    nose = Vector((0, ymin + 0.03, 0.66 * H))
    behind = [v for v in verts if v.y > yB + 0.04]
    if behind:
        tip = max(behind, key=lambda v: (v - hips).length)
        tip = Vector((tip.x, tip.y, max(tip.z, 0.2 * H)))
    else:
        tip = Vector((0, ymax - 0.02, 0.5 * H))
    tmid = hips.lerp(tip, 0.5)

    bones = [
        ('Root', hips, hips + Vector((0, 0.14, 0)), None),
        ('Spine', hips, chest, 'Root'),
        ('Neck', chest, headbase, 'Spine'),
        ('Head', headbase, nose, 'Neck'),
    ]
    if P['tail2']:
        bones += [('Tail1', hips, tmid, 'Root'), ('Tail2', tmid, tip, 'Tail1')]
    else:
        bones += [('Tail1', hips, tip, 'Root')]
    for leg, parent in (('FL', 'Spine'), ('FR', 'Spine'), ('BL', 'Root'), ('BR', 'Root')):
        fx, fy = feet[leg].x, feet[leg].y
        bones += [
            ('UpLeg.' + leg, Vector((fx, fy, 0.5 * H)), Vector((fx, fy, 0.24 * H)), parent),
            ('LoLeg.' + leg, Vector((fx, fy, 0.24 * H)), Vector((fx, fy, 0.02)), 'UpLeg.' + leg),
        ]

    arm = build_armature(name, bones, o.location)
    skin_mesh(o, arm, bones)

    def quad_walk(pbs, t, P=P):
        s = math.sin(TWO_PI * t)
        for leg, ph in (('FL', 0.0), ('BR', 0.0), ('FR', 0.5), ('BL', 0.5)):
            sw = math.sin(TWO_PI * (t + ph))
            lift = max(0.0, math.sin(TWO_PI * (t + ph) + 0.7))
            pbs['UpLeg.' + leg].rotation_euler = (P['swingA'] * sw, 0, 0)
            pbs['LoLeg.' + leg].rotation_euler = (P['kneeB'] * lift, 0, 0)
        pbs['Root'].location = (0, 0, P['bob'] * abs(math.sin(TWO_PI * t * 2)))
        pbs['Root'].rotation_euler = (0, 0.05 * s, 0)
        pbs['Spine'].rotation_euler = (0.03 * math.sin(TWO_PI * t * 2), 0, 0)
        pbs['Head'].rotation_euler = (P['headbob'] * math.sin(TWO_PI * t * 2 + 1.0), 0, 0)
        pbs['Tail1'].rotation_euler = (0, 0, P['walk_tail'] * s)
        if 'Tail2' in pbs:
            pbs['Tail2'].rotation_euler = (0, 0, P['walk_tail'] * math.sin(TWO_PI * t - 0.8))

    def quad_idle(pbs, t, P=P):
        s = math.sin(TWO_PI * t)
        pbs['Root'].location = (0, 0, 0.006 * s)
        pbs['Spine'].rotation_euler = (0.022 * s, 0, 0)
        pbs['Head'].rotation_euler = (0.04 * math.sin(TWO_PI * t + 0.9), 0, 0.05 * math.sin(TWO_PI * t * 0.5))
        pbs['Tail1'].rotation_euler = (0, 0, P['idle_tail'] * s)
        if 'Tail2' in pbs:
            pbs['Tail2'].rotation_euler = (0, 0, P['idle_tail'] * math.sin(TWO_PI * t - 0.9))

    key = name.split('_')[1]
    idle = author_clip(arm, 'Idle', key, 48, quad_idle)
    walk = author_clip(arm, 'Walk', key, 24, quad_walk)
    push_nla(arm, [idle, walk])
    report.append({'name': name, 'plan': 'quad', 'bones': len(bones),
                   'feet': {k: [round(v.x, 3), round(v.y, 3)] for k, v in feet.items()}})

# ── Chillwing — upright cave bat (biped plan) ────────────────────────────────
# Vertical pelvis->chest->head chain, 2-bone legs, one wing bone per side and a
# tail. Wings are horizontal-ish bones, so they flap on bone-local Z.
o = bpy.data.objects['Creature_Chillwing']
verts = [v.co.copy() for v in o.data.vertices]
H = max(v.z for v in verts)
ymin, ymax = min(v.y for v in verts), max(v.y for v in verts)
xmin, xmax = min(v.x for v in verts), max(v.x for v in verts)

# feet: the two largest ground clusters (bat stands on two legs)
cl = ground_clusters(verts, 0.12 * H, 0.12)
foot_c = [c for _, c in cl[:2]]
if len(foot_c) < 2:
    foot_c = [Vector((-0.10 * (xmax - xmin), 0, 0)), Vector((0.10 * (xmax - xmin), 0, 0))]
foot_c.sort(key=lambda p: p.x)
footL, footR = foot_c[0], foot_c[1]

pelvis = Vector((0, (footL.y + footR.y) / 2, 0.40 * H))
chest = Vector((0, pelvis.y - 0.02, 0.66 * H))
headbase = Vector((0, pelvis.y - 0.03, 0.78 * H))
nose = Vector((0, ymin + 0.03, 0.82 * H))
tailtip = Vector((0, ymax - 0.02, 0.22 * H))

bones = [
    ('Root', pelvis, pelvis + Vector((0, 0, 0.10)), None),
    ('Spine', pelvis, chest, 'Root'),
    ('Neck', chest, headbase, 'Spine'),
    ('Head', headbase, nose, 'Neck'),
    ('Tail1', pelvis, tailtip, 'Root'),
    ('Wing.L', Vector((-0.06, chest.y, 0.62 * H)), Vector((xmin + 0.01, chest.y + 0.04, 0.34 * H)), 'Spine'),
    ('Wing.R', Vector((0.06, chest.y, 0.62 * H)), Vector((xmax - 0.01, chest.y + 0.04, 0.34 * H)), 'Spine'),
]
for tag, f in (('L', footL), ('R', footR)):
    bones += [
        ('UpLeg.' + tag, Vector((f.x, f.y, 0.38 * H)), Vector((f.x, f.y, 0.19 * H)), 'Root'),
        ('LoLeg.' + tag, Vector((f.x, f.y, 0.19 * H)), Vector((f.x, f.y, 0.02)), 'UpLeg.' + tag),
    ]

arm = build_armature('Creature_Chillwing', bones, o.location)
skin_mesh(o, arm, bones)


def bat_walk(pbs, t):
    s = math.sin(TWO_PI * t)
    for tag, ph in (('L', 0.0), ('R', 0.5)):
        sw = math.sin(TWO_PI * (t + ph))
        lift = max(0.0, math.sin(TWO_PI * (t + ph) + 0.7))
        pbs['UpLeg.' + tag].rotation_euler = (0.46 * sw, 0, 0)
        pbs['LoLeg.' + tag].rotation_euler = (0.40 * lift, 0, 0)
    pbs['Root'].location = (0, 0, 0.016 * abs(math.sin(TWO_PI * t * 2)))
    pbs['Root'].rotation_euler = (0, 0.07 * s, 0)
    pbs['Spine'].rotation_euler = (0.04 * math.sin(TWO_PI * t * 2), 0, 0)
    pbs['Head'].rotation_euler = (0.06 * math.sin(TWO_PI * t * 2 + 1.0), 0, 0)
    pbs['Wing.L'].rotation_euler = (0, 0, 0.30 * s)
    pbs['Wing.R'].rotation_euler = (0, 0, -0.30 * s)
    pbs['Tail1'].rotation_euler = (0, 0, 0.14 * math.sin(TWO_PI * t - 0.6))


def bat_idle(pbs, t):
    s = math.sin(TWO_PI * t)
    pbs['Root'].location = (0, 0, 0.008 * s)
    pbs['Spine'].rotation_euler = (0.026 * s, 0, 0)
    pbs['Head'].rotation_euler = (0.05 * math.sin(TWO_PI * t + 0.9), 0, 0.10 * math.sin(TWO_PI * t * 0.5))
    pbs['Wing.L'].rotation_euler = (0, 0, 0.10 * s)
    pbs['Wing.R'].rotation_euler = (0, 0, -0.10 * s)
    pbs['Tail1'].rotation_euler = (0, 0, 0.07 * math.sin(TWO_PI * t - 0.4))


idle = author_clip(arm, 'Idle', 'Chillwing', 48, bat_idle)
walk = author_clip(arm, 'Walk', 'Chillwing', 24, bat_walk)
push_nla(arm, [idle, walk])
report.append({'name': 'Creature_Chillwing', 'plan': 'biped', 'bones': len(bones),
               'feet': {'L': [round(footL.x, 3), round(footL.y, 3)],
                        'R': [round(footR.x, 3), round(footR.y, 3)]}})

print(json.dumps(report, indent=1))
