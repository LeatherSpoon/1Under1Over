# build_player_kit.py — extend models/Player.glb with task animations + visible gear.
#
#   blender -b --factory-startup --python Assets/3D/Player/build_player_kit.py
#   env: BPK_RENDER=0 to skip QA renders, BPK_EXPORT=0 to skip GLB export/blend save
#
# BOOTSTRAP script (re-running regenerates gear + the four new clips from code and
# overwrites hand edits — once Player.blend is hand-edited, export via
# Assets/3D/export_blend.py instead; see that file's header).
#
# What it does:
#   1. Imports the SHIPPED models/Player.glb (mesh + 19-bone rig + Idle/Run NLA).
#   2. Deletes stray objects (an orphan 'Icosphere' rides the current file).
#   3. Authors four new clips parametrically — Gather (crouched collect loop),
#      Swing (overhead tool strike loop, drill/chop), Attack (combat slash,
#      one-shot), Flinch (hit reaction, one-shot) — keyframed on
#      rotation_quaternion (the imported Idle/Run are quaternion-mode; mixing
#      euler clips onto the same pose bones would break the NLA export bake).
#      Rotation SIGNS are resolved numerically per bone by probing pose-space
#      tail motion, never assumed from axis conventions.
#   4. Builds the gear kit procedurally (hard-surface = procedural Blender rule)
#      in the suit's livery (white shell / gunmetal / orange / teal glow) and
#      bone-parents each piece: weapons+tools to hand.R, shield to forearm.L,
#      armor + back-holsters to chest. Runtime (Player.js) toggles visibility;
#      material names containing 'Glow' are re-shaded to MeshBasic in-game.
#   5. QA renders (scratchpad-relative renders_qa/) at the fixed-camera pitch.
#   6. Exports models/Player.glb (NLA_TRACKS) then RE-IMPORTS it and asserts
#      clips + gear nodes survived, and saves Assets/3D/Player/Player.blend
#      with an export_offset-marked 'Player' collection (watcher path).
import bpy, os, sys, math, json
from mathutils import Vector, Matrix, Euler, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
GLB = os.path.join(REPO, 'models', 'Player.glb')
BLEND_OUT = os.path.join(HERE, 'Player.blend')
QA = os.path.join(HERE, 'renders_qa')
DO_RENDER = os.environ.get('BPK_RENDER', '1') != '0'
DO_EXPORT = os.environ.get('BPK_EXPORT', '1') != '0'
os.makedirs(QA, exist_ok=True)

FPS = 24
TWO_PI = 2 * math.pi
report = {}

bpy.ops.wm.read_homefile(use_empty=True)
scn = bpy.context.scene
scn.render.fps = FPS

bpy.ops.import_scene.gltf(filepath=GLB)

arm = bpy.data.objects.get('PlayerRig')
mesh = bpy.data.objects.get('PlayerMesh')
assert arm and mesh, 'PlayerRig/PlayerMesh missing after import'

# ── 1. cleanup strays (the shipped GLB grows an orphan Icosphere on import) ──
strays = [o for o in list(bpy.data.objects) if o not in (arm, mesh)]
report['removed_strays'] = [o.name for o in strays]
for o in strays:
    bpy.data.objects.remove(o, do_unlink=True)
for _ in range(3):
    bpy.data.orphans_purge(do_recursive=True)

tracks = [t.name for t in arm.animation_data.nla_tracks]
assert 'Idle' in tracks and 'Run' in tracks, 'Idle/Run NLA tracks missing: %s' % tracks

# ── 2. numeric sign resolution ───────────────────────────────────────────────
def zero_pose():
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    bpy.context.view_layer.update()


def _tail(bname):
    return arm.pose.bones[bname].tail.copy()


def rot_sign(bname, axis, want):
    """Sign s so that +s rotation about local `axis` moves the bone tail toward
    world direction `want` (armature at origin, identity)."""
    zero_pose()
    base = _tail(bname)
    best = (1, -9)
    for s in (1, -1):
        zero_pose()
        e = [0, 0, 0]
        e[axis] = s * 0.6
        arm.pose.bones[bname].rotation_quaternion = Euler(e, 'XYZ').to_quaternion()
        bpy.context.view_layer.update()
        d = _tail(bname) - base
        score = d.normalized().dot(want) if d.length > 1e-5 else -9
        if score > best[1]:
            best = (s, score)
    zero_pose()
    return best[0]


def loc_axis(bname, want):
    """(axis, sign) of pose-bone LOCATION that moves the bone head toward `want`."""
    zero_pose()
    pb = arm.pose.bones[bname]
    base = pb.head.copy()
    best = (1, 1, -9)
    for axis in range(3):
        for s in (1, -1):
            zero_pose()
            loc = [0, 0, 0]
            loc[axis] = s * 0.2
            pb.location = loc
            bpy.context.view_layer.update()
            d = pb.head - base
            score = d.normalized().dot(want) if d.length > 1e-5 else -9
            if score > best[2]:
                best = (axis, s, score)
    zero_pose()
    return best[0], best[1]


UP, DOWN, FWD, BACK = Vector((0, 0, 1)), Vector((0, 0, -1)), Vector((0, -1, 0)), Vector((0, 1, 0))
S = {
    'raiseL': rot_sign('upper_arm.L', 0, UP),   'raiseR': rot_sign('upper_arm.R', 0, UP),
    'afwdL':  rot_sign('upper_arm.L', 2, FWD),  'afwdR':  rot_sign('upper_arm.R', 2, FWD),
    'elbowL': rot_sign('forearm.L', 0, UP),     'elbowR': rot_sign('forearm.R', 0, UP),
    'efwdL':  rot_sign('forearm.L', 2, FWD),    'efwdR':  rot_sign('forearm.R', 2, FWD),
    'spineF': rot_sign('spine', 0, FWD),
    'chestF': rot_sign('chest', 0, FWD),
    'headD':  rot_sign('head', 0, FWD),
    'thighF_L': rot_sign('thigh.L', 0, FWD),    'thighF_R': rot_sign('thigh.R', 0, FWD),
    'kneeL':  rot_sign('shin.L', 0, BACK),      'kneeR':  rot_sign('shin.R', 0, BACK),
    'footD_L': rot_sign('foot.L', 0, DOWN),     'footD_R': rot_sign('foot.R', 0, DOWN),
}
# spine twist: sign that brings the RIGHT shoulder forward (about spine long axis)
zero_pose()
base_sh = _tail('shoulder.R')
twist_best = (1, -9)
for s in (1, -1):
    zero_pose()
    arm.pose.bones['spine'].rotation_quaternion = Euler((0, s * 0.5, 0), 'XYZ').to_quaternion()
    bpy.context.view_layer.update()
    score = (_tail('shoulder.R') - base_sh).dot(FWD)
    if score > twist_best[1]:
        twist_best = (s, score)
S['twistRfwd'] = twist_best[0]
zero_pose()
HIPS_DOWN = loc_axis('hips', DOWN)
report['signs'] = S
report['hips_down_axis'] = HIPS_DOWN

# ── 3. clip authoring ────────────────────────────────────────────────────────
def smooth(a, b, t):
    t = max(0.0, min(1.0, t))
    k = t * t * (3 - 2 * t)
    return a + (b - a) * k


def window(t, a, b):
    """0→1 smooth inside [a,b], 0 before, 1 after."""
    if b <= a:
        return 1.0 if t >= b else 0.0
    return smooth(0, 1, (t - a) / (b - a))


class P:
    """Pose assembler: accumulate eulers per bone, apply as quaternions."""
    def __init__(self):
        self.e = {}
        self.hips_dz = 0.0

    def add(self, bone, x=0.0, y=0.0, z=0.0):
        cur = self.e.setdefault(bone, [0.0, 0.0, 0.0])
        cur[0] += x
        cur[1] += y
        cur[2] += z

    # semantic helpers (signs resolved above)
    def arm(self, side, raise_=0.0, fwd=0.0, elbow=0.0, efwd=0.0):
        s = side.upper()
        self.add('upper_arm.' + s, x=S['raise' + s] * raise_, z=S['afwd' + s] * fwd)
        self.add('forearm.' + s, x=S['elbow' + s] * elbow, z=S['efwd' + s] * efwd)

    def torso(self, fwd=0.0, twistRf=0.0, side=0.0):
        self.add('spine', x=S['spineF'] * fwd * 0.55, y=S['twistRfwd'] * twistRf * 0.55, z=side * 0.5)
        self.add('chest', x=S['chestF'] * fwd * 0.45, y=S['twistRfwd'] * twistRf * 0.45, z=side * 0.5)

    def head(self, down=0.0, turn=0.0):
        self.add('neck', x=S['headD'] * down * 0.4)
        self.add('head', x=S['headD'] * down * 0.6, y=turn)

    def leg(self, side, fwd=0.0, knee=0.0, foot=0.0):
        s = side.upper()
        self.add('thigh.' + s, x=S['thighF_' + s] * fwd)
        self.add('shin.' + s, x=S['knee' + s] * knee)
        self.add('foot.' + s, x=S['footD_' + s] * foot)

    def hips(self, down=0.0, fwd=0.0, twistRf=0.0):
        self.hips_dz = down
        self.add('hips', x=S['spineF'] * fwd, y=S['twistRfwd'] * twistRf)

    def apply(self):
        for pb in arm.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
        for bone, e in self.e.items():
            arm.pose.bones[bone].rotation_quaternion = Euler(e, 'XYZ').to_quaternion()
        loc = [0.0, 0.0, 0.0]
        loc[HIPS_DOWN[0]] = HIPS_DOWN[1] * self.hips_dz
        arm.pose.bones['hips'].location = loc


# Neutral stance the one-shots settle back into (idle-adjacent: arms dropped).
def base_pose(p):
    p.arm('L', raise_=-0.95, fwd=0.10, elbow=0.15)
    p.arm('R', raise_=-0.95, fwd=0.10, elbow=0.15)


def pose_gather(t):
    p = P()
    bob = math.sin(TWO_PI * t)
    # half-crouch, feet planted
    p.hips(down=0.30 + 0.010 * bob, fwd=0.06)
    p.leg('L', fwd=0.78, knee=1.35, foot=-0.52)
    p.leg('R', fwd=0.78, knee=1.35, foot=-0.52)
    p.torso(fwd=0.30 + 0.02 * bob)
    p.head(down=0.24)
    # right arm: reach down-forward and pull back, twice per loop
    cyc = math.sin(TWO_PI * 2 * t)
    p.arm('R', raise_=-0.55, fwd=0.62 + 0.20 * cyc, elbow=0.25 + 0.30 * max(0.0, -cyc))
    # left arm braced across the knee
    p.arm('L', raise_=-0.72, fwd=0.35, elbow=0.50)
    return p


def pose_swing(t):
    p = P()
    # staggered stance
    p.leg('L', fwd=0.28, knee=0.18, foot=-0.10)
    p.leg('R', fwd=-0.16, knee=0.10)
    w = window(t, 0.02, 0.42)          # wind-up
    st = window(t, 0.46, 0.58)         # strike
    rec = window(t, 0.70, 0.98)        # recover to loop start
    up = w * (1 - st)
    down = st * (1 - rec)
    p.hips(down=0.04 + 0.07 * down, fwd=0.05)
    p.torso(fwd=-0.14 * up + 0.44 * down + 0.06, twistRf=-0.30 * up + 0.38 * down)
    p.head(down=0.10 + 0.18 * down)
    # right arm: raise overhead then hammer down-forward
    p.arm('R',
          raise_=-0.15 + 1.15 * up - 1.55 * down,
          fwd=0.25 + 0.30 * up + 0.45 * down,
          elbow=0.30 + 0.65 * up - 0.75 * down)
    # left arm counterbalances low
    p.arm('L', raise_=-0.85, fwd=0.30 + 0.10 * down, elbow=0.35)
    return p


def pose_attack(t):
    p = P()
    w = window(t, 0.0, 0.32)           # wind: arm back-up, torso coils
    st = window(t, 0.36, 0.56)         # slash across
    settle = window(t, 0.62, 1.0)      # ease back to base stance
    k = 1 - settle
    p.leg('L', fwd=0.30 * st * k, knee=0.15 * st * k)
    p.leg('R', fwd=-0.10 * st * k)
    p.hips(down=0.05 * st * k, twistRf=(-0.16 * w + 0.22 * st) * k)
    p.torso(fwd=0.10 * st * k, twistRf=(-0.42 * w + 0.55 * st) * k)
    p.head(down=0.08 * st * k, turn=0.0)
    # slash arm: ABSOLUTE channels blending wind -> strike -> back to base drop
    base_r, base_f, base_e = -0.95, 0.10, 0.15
    act_raise = 0.55 * w - 1.05 * st          # up-back, then cut down-across
    act_fwd = -0.50 * w + 1.15 * st
    act_elbow = 0.75 * w - 0.60 * st
    p.arm('R',
          raise_=act_raise * k + base_r * (1 - k),
          fwd=act_fwd * k + base_f * (1 - k),
          elbow=max(0.0, act_elbow) * k + base_e * (1 - k))
    p.arm('L', raise_=-0.95 + 0.25 * st * k, fwd=0.10 + 0.15 * st * k, elbow=0.15 + 0.30 * st * k)
    return p


def pose_flinch(t):
    p = P()
    base_pose(p)
    k = math.sin(math.pi * min(1.0, t * 1.25)) * (1 - window(t, 0.55, 1.0))
    p.hips(down=0.06 * k)
    p.torso(fwd=-0.30 * k, twistRf=0.10 * k)
    p.head(down=-0.28 * k)
    p.arm('R', raise_=0.30 * k, fwd=0.35 * k, elbow=0.55 * k)
    p.arm('L', raise_=0.30 * k, fwd=0.35 * k, elbow=0.55 * k)
    p.leg('L', knee=0.12 * k)
    p.leg('R', fwd=-0.10 * k, knee=0.18 * k)
    return p


def author(cname, nframes, pose_fn, loop=True):
    act = bpy.data.actions.new(cname)
    act.use_fake_user = True
    act['clip'] = cname
    adt = arm.animation_data or arm.animation_data_create()
    adt.action = act
    if hasattr(act, 'slots'):
        try:
            slot = act.slots.new(id_type='OBJECT', name=arm.name)
        except TypeError:
            slot = act.slots.new('OBJECT', arm.name)
        try:
            adt.action_slot = slot
        except Exception:
            pass
    frames = list(range(1, nframes + 2, 2))
    if frames[-1] != nframes + 1:
        frames.append(nframes + 1)
    for f in frames:
        t = ((f - 1) % nframes) / nframes if loop else min(1.0, (f - 1) / nframes)
        pose_fn(t).apply()
        for pb in arm.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=f)
        arm.pose.bones['hips'].keyframe_insert('location', frame=f)
    return act


acts = [
    author('Gather', 40, pose_gather, loop=True),
    author('Swing', 28, pose_swing, loop=True),
    author('Attack', 16, pose_attack, loop=False),
    author('Flinch', 12, pose_flinch, loop=False),
]
adt = arm.animation_data
adt.action = None
for act in acts:
    tr = adt.nla_tracks.new()
    tr.name = act['clip']
    st = tr.strips.new(act['clip'], 1, act)
    st.name = act['clip']
    if hasattr(st, 'action_slot') and getattr(act, 'slots', None) and len(act.slots):
        try:
            st.action_slot = act.slots[0]
        except Exception:
            pass
report['nla_tracks'] = [t.name for t in adt.nla_tracks]

# ── 4. gear kit ──────────────────────────────────────────────────────────────
def srgb2lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def mk_mat(name, hexcol, emissive=False):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    r, g, b = (hexcol >> 16) & 255, (hexcol >> 8) & 255, hexcol & 255
    col = (srgb2lin(r), srgb2lin(g), srgb2lin(b), 1.0)
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = col
    bsdf.inputs['Roughness'].default_value = 0.7
    if emissive:
        bsdf.inputs['Emission Color'].default_value = col
        bsdf.inputs['Emission Strength'].default_value = 2.0
    return m


WHITE = mk_mat('GearShell', 0xE8EAEA)
GUN = mk_mat('GearGun', 0x596066)
DARK = mk_mat('GearDark', 0x33363B)
ORANGE = mk_mat('GearAccent', 0xF08A2A)
STEEL = mk_mat('GearSteel', 0xC8CDD2)
TEAL = mk_mat('GearGlowTeal', 0x39D6C8, emissive=True)

_parts = []


def part(mat, size, loc, rot=(0, 0, 0), kind='cube', segs=12):
    if kind == 'cube':
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    elif kind == 'cyl':
        bpy.ops.mesh.primitive_cylinder_add(vertices=segs, radius=0.5, depth=1, location=loc, rotation=rot)
    elif kind == 'cone':
        bpy.ops.mesh.primitive_cone_add(vertices=segs, radius1=0.5, radius2=0.02, depth=1, location=loc, rotation=rot)
    elif kind == 'ico':
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.5, location=loc)
    o = bpy.context.active_object
    o.scale = size
    o.data.materials.append(mat)
    _parts.append(o)
    return o


def finish(name):
    global _parts
    bpy.ops.object.select_all(action='DESELECT')
    for o in _parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = _parts[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    scn.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    _parts = []
    return o


# Held items: modeled with the grip point AT the origin and the business end
# along -Y (character forward at rest) — handle coaxial with the blade, so a
# palm-down fist reads naturally. Bone-parented onto the grip point after.
def build_blade_scrap():
    part(DARK, (0.045, 0.045, 0.15), (0, 0.065, 0), rot=(math.radians(90), 0, 0), kind='cyl')  # grip (coaxial)
    part(GUN, (0.16, 0.035, 0.065), (0, -0.01, 0))                         # guard
    part(STEEL, (0.034, 0.38, 0.085), (0, -0.215, 0.0))                    # blade slab
    part(STEEL, (0.034, 0.15, 0.055), (0, -0.42, 0.012), rot=(math.radians(-14), 0, 0))  # tip
    part(ORANGE, (0.04, 0.08, 0.092), (0, -0.09, 0))                       # accent band
    return finish('Gear_BladeScrap')


def build_blade_basic():
    part(DARK, (0.05, 0.05, 0.16), (0, 0.07, 0), rot=(math.radians(90), 0, 0), kind='cyl')
    part(ORANGE, (0.062, 0.062, 0.035), (0, 0.155, 0), rot=(math.radians(90), 0, 0), kind='cyl')  # pommel
    part(GUN, (0.18, 0.04, 0.075), (0, -0.012, 0))                         # guard
    part(WHITE, (0.036, 0.44, 0.095), (0, -0.25, 0.0))                     # blade body
    part(TEAL, (0.018, 0.42, 0.024), (0, -0.25, 0.056))                    # glow edge (top, camera-facing)
    part(WHITE, (0.036, 0.13, 0.058), (0, -0.52, 0.012), rot=(math.radians(-16), 0, 0))  # tip
    return finish('Gear_BladeBasic')


def build_knuckles():
    part(GUN, (0.10, 0.11, 0.075), (0.02, 0, 0))                           # band over fist
    for i, dy in enumerate((-0.032, 0.0, 0.032)):
        part(ORANGE, (0.055, 0.028, 0.028), (0.085, dy, 0.01), rot=(0, math.radians(90), 0), kind='cone', segs=8)
    return finish('Gear_Knuckles')


def build_shield():
    part(WHITE, (0.38, 0.38, 0.035), (0, 0, 0), kind='cyl', segs=6)        # hex face
    part(ORANGE, (0.30, 0.30, 0.018), (0, 0, 0.026), kind='cyl', segs=6)   # inner ring
    part(WHITE, (0.20, 0.20, 0.02), (0, 0, 0.038), kind='cyl', segs=6)
    part(TEAL, (0.07, 0.07, 0.02), (0, 0, 0.052), kind='cyl', segs=12)     # core glow
    return finish('Gear_Shield')


def build_drill():
    part(GUN, (0.10, 0.22, 0.11), (0, -0.10, 0.055))                       # body
    part(DARK, (0.05, 0.06, 0.13), (0, 0.0, -0.045))                       # grip (in fist)
    part(ORANGE, (0.104, 0.06, 0.03), (0, -0.19, 0.115))                   # top accent
    part(TEAL, (0.03, 0.05, 0.03), (0, 0.015, 0.09))                       # power cell
    part(STEEL, (0.05, 0.16, 0.05), (0, -0.29, 0.055), rot=(math.radians(90), 0, 0), kind='cone', segs=8)  # bit
    part(GUN, (0.075, 0.075, 0.05), (0, -0.225, 0.055), rot=(math.radians(90), 0, 0), kind='cyl', segs=8)  # chuck
    return finish('Gear_ToolDrill')


def build_cutter():
    part(DARK, (0.05, 0.05, 0.42), (0, -0.08, 0), rot=(math.radians(90), 0, 0), kind='cyl')  # haft (coaxial)
    part(ORANGE, (0.056, 0.056, 0.035), (0, 0.115, 0), rot=(math.radians(90), 0, 0), kind='cyl')  # butt cap
    part(GUN, (0.065, 0.09, 0.065), (0, -0.29, 0))                         # head socket
    part(WHITE, (0.036, 0.13, 0.17), (0, -0.30, -0.075))                   # axe head (hangs below)
    part(TEAL, (0.02, 0.12, 0.03), (0, -0.305, -0.155))                    # glow edge (chop side, down)
    return finish('Gear_ToolCutter')


def build_armor():
    for sx in (-1, 1):                                                     # pauldron caps, outboard
        part(WHITE, (0.17, 0.16, 0.11), (sx * 0.235, 0, 1.355), kind='ico')
        part(ORANGE, (0.13, 0.12, 0.035), (sx * 0.250, 0, 1.398),
             rot=(0, math.radians(sx * 14), 0))
        part(GUN, (0.055, 0.11, 0.055), (sx * 0.175, 0, 1.335))            # strap in
    part(WHITE, (0.20, 0.045, 0.14), (0, -0.165, 1.275))                   # sternum plate
    part(ORANGE, (0.15, 0.028, 0.038), (0, -0.185, 1.318))                 # chevron
    part(TEAL, (0.05, 0.026, 0.05), (0, -0.188, 1.252))                    # core light
    part(WHITE, (0.22, 0.04, 0.13), (0, 0.165, 1.28))                      # back plate
    return finish('Gear_ArmorChest')


GRIP_R = Vector((0.80, -0.02, 1.268))


def place(obj, loc, rot=(0, 0, 0)):
    obj.location = loc
    obj.rotation_euler = rot
    bpy.context.view_layer.update()


def bone_parent(obj, bone):
    # Direct property parenting (parent_set ops are unreliable headless): the
    # bone-parent frame sits at the bone TAIL with the bone's orientation.
    b = arm.data.bones[bone]
    frame = arm.matrix_world @ b.matrix_local @ Matrix.Translation((0, b.length, 0))
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone
    obj.matrix_parent_inverse = frame.inverted()
    bpy.context.view_layer.update()


zero_pose()
gear = {}

o = build_blade_scrap(); place(o, GRIP_R); bone_parent(o, 'hand.R'); gear[o.name] = 'hand.R'
o = build_blade_basic(); place(o, GRIP_R); bone_parent(o, 'hand.R'); gear[o.name] = 'hand.R'
o = build_knuckles(); place(o, Vector((0.88, -0.02, 1.262))); bone_parent(o, 'hand.R'); gear[o.name] = 'hand.R'
o = build_drill(); place(o, GRIP_R); bone_parent(o, 'hand.R'); gear[o.name] = 'hand.R'
o = build_cutter(); place(o, GRIP_R); bone_parent(o, 'hand.R'); gear[o.name] = 'hand.R'
o = build_shield(); place(o, Vector((-0.575, -0.017, 1.312))); bone_parent(o, 'forearm.L'); gear[o.name] = 'forearm.L'
o = build_armor(); place(o, (0, 0, 0)); bone_parent(o, 'chest'); gear[o.name] = 'chest'

# back-holstered copies (chest bone): diagonal across the back plate
def back_copy(src_name, new_name, loc, rot):
    src = bpy.data.objects[src_name]
    dup = src.copy()
    dup.data = src.data
    dup.name = new_name
    scn.collection.objects.link(dup)
    dup.parent = None
    dup.matrix_parent_inverse = Matrix.Identity(4)
    place(dup, loc, rot)
    bone_parent(dup, 'chest')
    gear[new_name] = 'chest'
    return dup


back_copy('Gear_BladeScrap', 'Gear_BladeScrapB', Vector((0.16, 0.21, 1.33)),
          (math.radians(108), math.radians(-20), 0))
back_copy('Gear_BladeBasic', 'Gear_BladeBasicB', Vector((0.16, 0.21, 1.33)),
          (math.radians(108), math.radians(-20), 0))
back_copy('Gear_Shield', 'Gear_ShieldB', Vector((-0.06, 0.235, 1.24)),
          (math.radians(-96), 0, math.radians(10)))

report['gear'] = {n: {'bone': b, 'tris': len(bpy.data.objects[n].data.polygons)} for n, b in gear.items()}

# ── 5. QA renders ────────────────────────────────────────────────────────────
if DO_RENDER:
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            scn.render.engine = eng
            break
        except Exception:
            pass
    sun = bpy.data.objects.new('QASun', bpy.data.lights.new('QASun', 'SUN'))
    sun.data.energy = 3.0
    sun.data.use_shadow = False
    sun.rotation_euler = (0.9, 0, 0.6)
    scn.collection.objects.link(sun)
    cam = bpy.data.objects.new('QACam', bpy.data.cameras.new('QACam'))
    scn.collection.objects.link(cam)
    scn.camera = cam
    scn.render.resolution_x = 640
    scn.render.resolution_y = 640

    ALL_GEAR = list(gear.keys())

    # Mute every NLA track for QA: with tracks live, pose/action evaluation is
    # the whole stack blended — every render becomes an Idle+Run+clips soup.
    # (Export UNMUTES them again: NLA_TRACKS export skips muted tracks.)
    for tr in adt.nla_tracks:
        tr.mute = True

    def show_only(names):
        for n in ALL_GEAR:
            bpy.data.objects[n].hide_render = n not in names

    def render(name, yaw_deg=0, game_pitch=True, dist=3.6, look_z=0.95, look_at=None):
        yaw = math.radians(yaw_deg)
        look = Vector(look_at) if look_at else Vector((0, 0, look_z))
        if game_pitch:
            d = Vector((0, -13.5, 14)).normalized() * dist
            off = Vector((d.x * math.cos(yaw) - d.y * math.sin(yaw),
                          d.x * math.sin(yaw) + d.y * math.cos(yaw), d.z))
            cam.location = look + off if look_at else off
        else:
            off = Vector((dist * math.sin(yaw), -dist * math.cos(yaw), dist * 0.20))
            cam.location = look + off
        cam.rotation_euler = (look - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scn.render.filepath = os.path.join(QA, name + '.png')
        bpy.ops.render.render(write_still=True)

    def set_act(act, frame):
        adt.action = act
        if getattr(act, 'slots', None) and len(act.slots):
            try:
                adt.action_slot = act.slots[0]
            except Exception:
                pass
        scn.frame_set(frame)

    ACT = {a['clip']: a for a in acts}
    # gear showcase (rest pose)
    adt.action = None
    zero_pose()
    show_only(['Gear_BladeBasic', 'Gear_Shield', 'Gear_ArmorChest'])
    render('gear_front', 0); render('gear_side', 90); render('gear_persp', 30, game_pitch=False)
    show_only(['Gear_BladeScrapB', 'Gear_ShieldB', 'Gear_ArmorChest'])
    render('gear_back', 180)
    HAND = (0.82, -0.02, 1.26)
    show_only(['Gear_Knuckles']); render('knuckles_side', 90, game_pitch=False, dist=1.5, look_at=HAND)
    show_only(['Gear_ToolDrill']); render('drill_side', 90, game_pitch=False, dist=1.5, look_at=HAND)
    show_only(['Gear_ToolCutter']); render('cutter_side', 90, game_pitch=False, dist=1.5, look_at=HAND)
    # clip phases
    show_only([])
    for f in (1, 11, 21, 31):
        set_act(ACT['Gather'], f); render('anim_gather_f%02d' % f)
        if f in (11, 21):
            render('anim_gather_f%02d_side' % f, 90, game_pitch=False, dist=3.0, look_z=0.75)
    show_only(['Gear_ToolDrill', 'Gear_ArmorChest'])
    for f in (1, 9, 14, 17, 23):
        set_act(ACT['Swing'], f); render('anim_swing_f%02d' % f)
        if f == 14:
            render('anim_swing_f14_side', 90)
    show_only(['Gear_BladeBasic', 'Gear_ArmorChest'])
    for f in (1, 6, 9, 13):
        set_act(ACT['Attack'], f); render('anim_attack_f%02d' % f)
    show_only([])
    for f in (3, 6, 10):
        set_act(ACT['Flinch'], f); render('anim_flinch_f%02d' % f)
    set_act(ACT['Flinch'], 5)
    render('anim_flinch_f05_side', 90, game_pitch=False, dist=3.2, look_z=0.95)
    # game-distance sanity (how it reads at real screen size)
    adt.action = None
    zero_pose()
    show_only(['Gear_BladeBasicB', 'Gear_ShieldB', 'Gear_ArmorChest'])
    render('gamescale_back', 165, dist=9.5)
    adt.action = None
    for o in ('QASun', 'QACam'):
        bpy.data.objects.remove(bpy.data.objects[o], do_unlink=True)

# ── 6. export + round-trip verify + save .blend ──────────────────────────────
if DO_EXPORT:
    zero_pose()
    adt.action = None
    for tr in adt.nla_tracks:
        tr.mute = False
    for n in gear:
        bpy.data.objects[n].hide_render = False
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    mesh.select_set(True)
    for n in gear:
        bpy.data.objects[n].select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True,
                              export_animation_mode='NLA_TRACKS')
    report['glb_kb'] = round(os.path.getsize(GLB) / 1024, 1)

    # save the owner-editable source (watcher convention: one marked collection)
    coll = bpy.data.collections.new('Player')
    scn.collection.children.link(coll)
    for o in [arm, mesh] + [bpy.data.objects[n] for n in gear]:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
    coll['export_offset'] = [0.0, 0.0, 0.0]
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)

    # round-trip verify in a fresh scene
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB)
    arm2 = bpy.data.objects.get('PlayerRig')
    names = {o.name for o in bpy.data.objects}
    rt = {
        'tracks': sorted(t.name for t in arm2.animation_data.nla_tracks) if arm2 and arm2.animation_data else [],
        'gear_present': sorted(n for n in gear if n in names),
        'gear_missing': sorted(n for n in gear if n not in names),
    }
    # bone-parent round trip: blade grip should evaluate near the authored spot
    dep = bpy.context.evaluated_depsgraph_get()
    ob = bpy.data.objects.get('Gear_BladeScrap')
    if ob:
        w = ob.evaluated_get(dep).matrix_world.translation
        rt['bladeScrap_world'] = [round(v, 3) for v in w]
        rt['bladeScrap_expected'] = [round(v, 3) for v in GRIP_R]
        rt['bladeScrap_offset'] = round((w - GRIP_R).length, 4)
    report['roundtrip'] = rt

print('BPK ' + json.dumps(report))
