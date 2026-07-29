# Rig + animate the Landing Site creatures and NPCs in LandingSite.blend.
#
# Same pipeline as Assets/3D/GlacialHollow/rig_creatures.py and
# Assets/3D/VerdantMaw/npc_rig.py — read those first, they document the why.
# Meshes must already be normalized by normalize_creatures.py: grounded z=0,
# centred XY, facing -y, final native scale.
#
#   Mossback    quad  — broad plated grazer, slow heavy plod
#   Burrfang    quad  — lean bristly predator, quick light trot
#   Stiltbeak   biped — long-legged wading bird, high stepping gait
#   ScrapTyrant biped — armoured raptor boss, heavy stomp + tail counterweight
#   Mara/Finch  NPC   — breathing-spine humanoids, Idle only
#
# Actions are named '<Clip>_<Key>' because Blender's action namespace is
# file-global and every rig shares this file; the NLA *track* is what glTF
# NLA_TRACKS mode exports as the clip name, so tracks stay 'Idle'/'Walk'
# (Enemy.js matches /idle/i and /walk/i, Environment._addNpc matches /idle/i).
import bpy, math, json
from mathutils import Vector

assert bpy.data.filepath.endswith('LandingSite.blend'), bpy.data.filepath

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
    """Feet from ground-contact vertex clusters — never bbox fractions, a
    sideways tail fools them."""
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


def skin_mesh(mesh_obj, arm, bone_specs, K=2):
    """Nearest-bone-segment weights (1/d^4). Bone-heat always fails on Rodin
    soup (non-manifold shards), so ARMATURE_AUTO is never attempted."""
    segs = {b[0]: (Vector(b[1]), Vector(b[2])) for b in bone_specs}
    groups = {bname: mesh_obj.vertex_groups.new(name=bname) for bname in segs}
    names = list(segs.keys())
    for v in mesh_obj.data.vertices:
        p = v.co
        ds = sorted(((seg_dist(p, *segs[n]), n) for n in names))[:K]
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
    act['clip'] = track
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
    # Keyframe every 2 frames; first and last frame identical for a clean loop.
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
    for t in list(adt.nla_tracks):
        adt.nla_tracks.remove(t)
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


ALL = ['Creature_Mossback', 'Creature_Burrfang', 'Creature_Stiltbeak',
       'Boss_ScrapTyrant', 'Npc_Mara', 'Npc_Finch']

# Idempotent re-run: drop any rig this script made, un-parent the meshes and
# clear vertex groups/modifiers so feet detection sees a clean mesh again.
for name in ALL:
    mesh = bpy.data.objects.get(name)
    if mesh:
        mesh.parent = None
        mesh.matrix_parent_inverse.identity()
        for m in list(mesh.modifiers):
            if m.type == 'ARMATURE':
                mesh.modifiers.remove(m)
        mesh.vertex_groups.clear()
    old = bpy.data.objects.get(name + '_Rig')
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
for act in list(bpy.data.actions):
    if act.name.startswith(('Idle_', 'Walk_')):
        bpy.data.actions.remove(act)

report = []

# ── Quadrupeds ───────────────────────────────────────────────────────────────
QUADS = {
    'Creature_Mossback': {   # broad plated grazer — short stride, heavy plod
        'swingA': 0.30, 'kneeB': 0.26, 'bob': 0.010, 'tail2': False,
        'idle_tail': 0.08, 'walk_tail': 0.13, 'headbob': 0.05,
    },
    'Creature_Burrfang': {   # lean predator — long stride, light quick trot
        'swingA': 0.54, 'kneeB': 0.46, 'bob': 0.014, 'tail2': True,
        'idle_tail': 0.16, 'walk_tail': 0.26, 'headbob': 0.07,
    },
}

for name, P in QUADS.items():
    o = bpy.data.objects[name]
    verts = [v.co.copy() for v in o.data.vertices]
    H = max(v.z for v in verts)
    ymin, ymax = min(v.y for v in verts), max(v.y for v in verts)
    feet = detect_feet(verts, H)
    if feet is None:
        L = ymax - ymin
        yc = (ymax + ymin) / 2
        feet = {k: Vector((sx * 0.16 * H, yc + sy * 0.28 * L, 0)) for k, (sx, sy) in
                {'FL': (-1, -1), 'FR': (1, -1), 'BL': (-1, 1), 'BR': (1, 1)}.items()}
    yF = (feet['FL'].y + feet['FR'].y) / 2
    yB = (feet['BL'].y + feet['BR'].y) / 2
    hips = Vector((0, yB, 0.52 * H))
    chest = Vector((0, yF, 0.55 * H))
    headbase = Vector((0, max(ymin + 0.22 * (yF - ymin), yF - 0.12), 0.74 * H))
    nose = Vector((0, ymin + 0.02, 0.66 * H))
    behind = [v for v in verts if v.y > yB + 0.03]
    if behind:
        tip = max(behind, key=lambda v: (v - hips).length)
        tip = Vector((tip.x, tip.y, max(tip.z, 0.2 * H)))
    else:
        tip = Vector((0, ymax - 0.02, 0.5 * H))
    tmid = hips.lerp(tip, 0.5)

    bones = [
        ('Root', hips, hips + Vector((0, 0.10 * H, 0)), None),
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
            ('LoLeg.' + leg, Vector((fx, fy, 0.24 * H)), Vector((fx, fy, 0.01 * H)), 'UpLeg.' + leg),
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
        pbs['Head'].rotation_euler = (0.04 * math.sin(TWO_PI * t + 0.9), 0,
                                      0.05 * math.sin(TWO_PI * t * 0.5))
        pbs['Tail1'].rotation_euler = (0, 0, P['idle_tail'] * s)
        if 'Tail2' in pbs:
            pbs['Tail2'].rotation_euler = (0, 0, P['idle_tail'] * math.sin(TWO_PI * t - 0.9))

    key = name.split('_')[1]
    idle = author_clip(arm, 'Idle', key, 48, quad_idle)
    walk = author_clip(arm, 'Walk', key, 24, quad_walk)
    push_nla(arm, [idle, walk])
    report.append({'name': name, 'plan': 'quad', 'bones': len(bones),
                   'feet': {k: [round(v.x, 3), round(v.y, 3)] for k, v in feet.items()}})

# ── Bipeds: Stiltbeak (wader) and ScrapTyrant (raptor boss) ──────────────────
BIPEDS = {
    'Creature_Stiltbeak': {
        'swing': 0.62, 'knee': 0.70, 'bob': 0.020, 'lean': 0.06,
        'idle_head': 0.09, 'tail2': False, 'arms': 'wing',
        'arm_idle': 0.08, 'arm_walk': 0.16,
        # A wader's mass sits over very long legs: high knee lift, tall pelvis.
        'pelvis_z': 0.46, 'chest_z': 0.70, 'head_z': 0.86,
    },
    'Boss_ScrapTyrant': {
        'swing': 0.40, 'knee': 0.38, 'bob': 0.024, 'lean': 0.09,
        'idle_head': 0.05, 'tail2': True, 'arms': 'claw',
        'arm_idle': 0.05, 'arm_walk': 0.12,
        'pelvis_z': 0.44, 'chest_z': 0.66, 'head_z': 0.84,
    },
}

for name, P in BIPEDS.items():
    o = bpy.data.objects[name]
    verts = [v.co.copy() for v in o.data.vertices]
    H = max(v.z for v in verts)
    ymin, ymax = min(v.y for v in verts), max(v.y for v in verts)
    xmin, xmax = min(v.x for v in verts), max(v.x for v in verts)

    cl = ground_clusters(verts, 0.12 * H, 0.10)
    foot_c = [c for _, c in cl[:2]]
    if len(foot_c) < 2:
        foot_c = [Vector((-0.12 * (xmax - xmin), 0, 0)),
                  Vector((0.12 * (xmax - xmin), 0, 0))]
    foot_c.sort(key=lambda p: p.x)
    footL, footR = foot_c[0], foot_c[1]
    # A wader can plant both feet nearly together; a rig with two coincident leg
    # chains animates as one leg. Force a minimum stance width.
    if abs(footR.x - footL.x) < 0.06 * H:
        cx = (footL.x + footR.x) / 2
        footL = Vector((cx - 0.05 * H, footL.y, 0))
        footR = Vector((cx + 0.05 * H, footR.y, 0))

    pelvis = Vector((0, (footL.y + footR.y) / 2, P['pelvis_z'] * H))
    chest = Vector((0, pelvis.y - 0.02 * H, P['chest_z'] * H))
    headbase = Vector((0, pelvis.y - 0.03 * H, P['head_z'] * H))
    nose = Vector((0, ymin + 0.02, P['head_z'] * H + 0.02 * H))
    tailtip = Vector((0, ymax - 0.02, 0.30 * H))
    tmid = pelvis.lerp(tailtip, 0.5)

    bones = [
        ('Root', pelvis, pelvis + Vector((0, 0, 0.10 * H)), None),
        ('Spine', pelvis, chest, 'Root'),
        ('Neck', chest, headbase, 'Spine'),
        ('Head', headbase, nose, 'Neck'),
    ]
    if P['tail2']:
        bones += [('Tail1', pelvis, tmid, 'Root'), ('Tail2', tmid, tailtip, 'Tail1')]
    else:
        bones += [('Tail1', pelvis, tailtip, 'Root')]
    reach = 0.45 if P['arms'] == 'wing' else 0.30
    bones += [
        ('Arm.L', Vector((-0.05 * H, chest.y, P['chest_z'] * H * 0.94)),
         Vector((xmin + (xmax - xmin) * (0.5 - reach * 0.5), chest.y + 0.04 * H, 0.42 * H)), 'Spine'),
        ('Arm.R', Vector((0.05 * H, chest.y, P['chest_z'] * H * 0.94)),
         Vector((xmax - (xmax - xmin) * (0.5 - reach * 0.5), chest.y + 0.04 * H, 0.42 * H)), 'Spine'),
    ]
    for tag, f in (('L', footL), ('R', footR)):
        bones += [
            ('UpLeg.' + tag, Vector((f.x, f.y, P['pelvis_z'] * H)),
             Vector((f.x, f.y, P['pelvis_z'] * H * 0.5)), 'Root'),
            ('LoLeg.' + tag, Vector((f.x, f.y, P['pelvis_z'] * H * 0.5)),
             Vector((f.x, f.y, 0.01 * H)), 'UpLeg.' + tag),
        ]

    arm = build_armature(name, bones, o.location)
    skin_mesh(o, arm, bones)

    def biped_walk(pbs, t, P=P):
        s = math.sin(TWO_PI * t)
        for tag, ph in (('L', 0.0), ('R', 0.5)):
            sw = math.sin(TWO_PI * (t + ph))
            lift = max(0.0, math.sin(TWO_PI * (t + ph) + 0.7))
            pbs['UpLeg.' + tag].rotation_euler = (P['swing'] * sw, 0, 0)
            pbs['LoLeg.' + tag].rotation_euler = (P['knee'] * lift, 0, 0)
        pbs['Root'].location = (0, 0, P['bob'] * abs(math.sin(TWO_PI * t * 2)))
        pbs['Root'].rotation_euler = (0, P['lean'] * s, 0)
        pbs['Spine'].rotation_euler = (0.04 * math.sin(TWO_PI * t * 2), 0, 0)
        pbs['Head'].rotation_euler = (0.06 * math.sin(TWO_PI * t * 2 + 1.0), 0, 0)
        pbs['Arm.L'].rotation_euler = (0, 0, P['arm_walk'] * s)
        pbs['Arm.R'].rotation_euler = (0, 0, -P['arm_walk'] * s)
        pbs['Tail1'].rotation_euler = (0, 0, 0.14 * math.sin(TWO_PI * t - 0.6))
        if 'Tail2' in pbs:
            pbs['Tail2'].rotation_euler = (0, 0, 0.12 * math.sin(TWO_PI * t - 1.2))

    def biped_idle(pbs, t, P=P):
        s = math.sin(TWO_PI * t)
        pbs['Root'].location = (0, 0, 0.008 * s)
        pbs['Spine'].rotation_euler = (0.026 * s, 0, 0)
        pbs['Head'].rotation_euler = (0.05 * math.sin(TWO_PI * t + 0.9), 0,
                                      P['idle_head'] * math.sin(TWO_PI * t * 0.5))
        pbs['Arm.L'].rotation_euler = (0, 0, P['arm_idle'] * s)
        pbs['Arm.R'].rotation_euler = (0, 0, -P['arm_idle'] * s)
        pbs['Tail1'].rotation_euler = (0, 0, 0.07 * math.sin(TWO_PI * t - 0.4))
        if 'Tail2' in pbs:
            pbs['Tail2'].rotation_euler = (0, 0, 0.06 * math.sin(TWO_PI * t - 1.0))

    key = name.split('_')[1]
    idle = author_clip(arm, 'Idle', key, 48, biped_idle)
    walk = author_clip(arm, 'Walk', key, 24, biped_walk)
    push_nla(arm, [idle, walk])
    report.append({'name': name, 'plan': 'biped', 'bones': len(bones),
                   'feet': {'L': [round(footL.x, 3), round(footL.y, 3)],
                            'R': [round(footR.x, 3), round(footR.y, 3)]}})

# ── NPCs — breathing-spine plan, Idle only ───────────────────────────────────
# Humanoids arrive posed (arms at sides), so no arm/leg bones: everything binds
# to a vertical chain. Subtle chest/head motion reads alive while feet stay
# planted and the posed arms follow the torso rigidly.
NPCS = {
    'Npc_Mara':  {'bob': 0.006, 'spine': 0.020, 'head_turn': 0.10, 'head_nod': 0.030},
    'Npc_Finch': {'bob': 0.008, 'spine': 0.026, 'head_turn': 0.14, 'head_nod': 0.036},
}

for name, P in NPCS.items():
    o = bpy.data.objects[name]
    H = max(v.co.z for v in o.data.vertices)
    bones = [
        ('Root',   Vector((0, 0, 0.00)),        Vector((0, 0, 0.30 * H)), None),
        ('pelvis', Vector((0, 0, 0.30 * H)),    Vector((0, 0, 0.48 * H)), 'Root'),
        ('spine',  Vector((0, 0, 0.48 * H)),    Vector((0, 0, 0.66 * H)), 'pelvis'),
        ('chest',  Vector((0, 0, 0.66 * H)),    Vector((0, 0, 0.82 * H)), 'spine'),
        ('neck',   Vector((0, 0, 0.82 * H)),    Vector((0, 0, 0.90 * H)), 'chest'),
        ('head',   Vector((0, 0, 0.90 * H)),    Vector((0, 0, 1.00 * H)), 'neck'),
    ]
    arm = build_armature(name, bones, o.location)
    skin_mesh(o, arm, bones, K=3)

    def npc_idle(pbs, t, P=P):
        s = math.sin(TWO_PI * t)
        pbs['Root'].location = (0, 0, P['bob'] * (0.5 - 0.5 * math.cos(TWO_PI * t)))
        pbs['spine'].rotation_euler = (P['spine'] * (0.5 - 0.5 * math.cos(TWO_PI * t)), 0, 0)
        pbs['chest'].rotation_euler = (P['spine'] * 0.6 * (0.5 - 0.5 * math.cos(TWO_PI * t)),
                                       0, 0.012 * s)
        pbs['neck'].rotation_euler = (P['head_nod'] * 0.5 * s, 0, 0)
        pbs['head'].rotation_euler = (P['head_nod'] * s, P['head_turn'] * math.sin(TWO_PI * t * 0.5), 0)

    idle = author_clip(arm, 'Idle', name.split('_')[1], 72, npc_idle)
    push_nla(arm, [idle])
    report.append({'name': name, 'plan': 'npc', 'bones': len(bones), 'H': round(H, 3)})

bpy.ops.wm.save_mainfile()
print(json.dumps(report, indent=1))
