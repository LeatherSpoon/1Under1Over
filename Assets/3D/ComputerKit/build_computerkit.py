# build_computerkit.py — process the 8 raw Rodin ComputerKit Era-1 sculpts into
# game-ready GLBs in D:\2Under2Over\models\, plus ComputerKit.blend + check renders.
#
# Run: & "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --factory-startup --python build_computerkit.py
#
# Reuses the proven VerdantMaw pipeline (import → join → single 512px diffuse-only
# material → orient → normalize). Architectural pieces (walls/roof) are oriented by
# SPAN SORT (longest span = length, shortest = thickness) because the six-axis slab
# test lays a thin wall flat on its face; props use the slab test. Every piece gets
# two check renders at the game's ~46° camera pitch (camera up-hint pinned to 'Z' —
# the 'Y' up-hint is the documented tipped-render trap). Per-piece FIX overrides
# (extra rotation after auto-orient) live in FIXES below — edit after eyeballing.
import bpy, math, os, sys
import mathutils
import numpy as np

SRC_DIR = r'D:\2Under2Over\Assets\3D\ComputerKit'
MODELS = r'D:\2Under2Over\models'
RENDERS = os.path.join(SRC_DIR, 'renders')
os.makedirs(RENDERS, exist_ok=True)
sys.path.insert(0, r'D:\2Under2Over\Assets\3D\VerdantMaw')
import rodin_process as rp

# Per-piece manual fix rotations (degrees about X/Y/Z, applied after auto-orient),
# from eyeballing the check renders. yaw turns the piece's front toward +Y.
FIXES = {
    # verified against renders/ + renders/chooser (round 4, camera roll fixed):
    'CK1_FieldTerminal': {'y': 90},
    'CK1_ExpeditionRack': {'x': 180},  # clean white cap is the TOP
}

# name -> dict(mode, dims). Blender axes: x=game-x width, y=game-z depth, z=game-y height.
PIECES = [
    # v1 sculpt (rodin_CK1_Wall_raw.glb) quality-rejected: gunmetal, rounded
    # corners, no cladding. raw2 is the re-roll (prompt in rodin_kit_jobs.json).
    ('CK1_Wall',            dict(mode='wall',  L=6.0, H=3.0, Tmin=0.3, Tmax=0.5,
                                 raw='rodin_CK1_Wall_raw2.glb')),
    ('CK1_WallDoor',        dict(mode='wall',  L=6.0, H=3.0, Tmin=0.3, Tmax=0.5,
                                 door=dict(w=2.3, h=2.5))),
    ('CK1_RoofPanel',       dict(mode='roof',  L=6.0, W=6.0, Hmin=0.35, Hmax=0.6)),
    ('CK1_FieldTerminal',   dict(mode='prop',  H=1.1, orient='slab', level=False)),
    ('CK1_MissionServer',   dict(mode='prop',  H=1.8, orient='slab')),
    # bench + pallet arrive upright from Rodin; PCA leveling misfires on the
    # bench's open frame (slanted shelf content reads as a 41 deg lean)
    ('CK1_IntegrationBench',dict(mode='prop',  H=1.0, orient='none', level=False)),
    ('CK1_ExpeditionRack',  dict(mode='prop',  H=2.6, orient='ratio', exp=(1.0, 0.9, 2.6))),
    # pallet stack is taller than planned; anchor its footprint width instead
    ('CK1_Pallet',          dict(mode='prop',  W=1.3, orient='none')),
]

TARGET_TRIS = 30000


def spans(ob):
    vs = ob.data.vertices
    mn = [min(v.co[i] for v in vs) for i in range(3)]
    mx = [max(v.co[i] for v in vs) for i in range(3)]
    return [mx[i] - mn[i] for i in range(3)], mn, mx


def look_at(cam, target):
    """Aim camera at target with world +Z as up — NEVER to_track_quat with a
    Z up-hint on a -Z track (degenerate: arbitrary roll, the round-1/2 trap)."""
    f = (target - cam.location).normalized()
    r = f.cross(mathutils.Vector((0, 0, 1)))
    if r.length < 1e-6:
        r = mathutils.Vector((1, 0, 0))
    r.normalize()
    u = r.cross(f)
    cam.rotation_euler = mathutils.Matrix((r, u, -f)).transposed().to_euler()


def pca_level(ob):
    """Rodin sketches can come back leaning at arbitrary angles (wall yawed 13.7
    deg, roof pitched 16.2, bench tilted 41 in this batch). Rotate so each PCA
    principal axis snaps to its nearest world axis — small correction only, no
    axis permutation."""
    n = len(ob.data.vertices)
    co = np.empty(n * 3)
    ob.data.vertices.foreach_get('co', co)
    pts = co.reshape(-1, 3)
    pts = pts - pts.mean(axis=0)
    evals, evecs = np.linalg.eigh(np.cov(pts.T))
    order = np.argsort(evals)[::-1]
    evecs = evecs[:, order]
    targets = np.zeros((3, 3))
    used = set()
    max_tilt = 0.0
    for i in range(3):
        v = evecs[:, i]
        nearest = int(np.argmax(np.abs(v)))
        if nearest in used:
            print('  pca_level: ambiguous assignment, skipped')
            return
        used.add(nearest)
        sign = 1.0 if v[nearest] >= 0 else -1.0
        targets[nearest, i] = sign
        max_tilt = max(max_tilt, math.degrees(math.acos(min(1.0, abs(v[nearest])))))
    R = targets @ evecs.T
    if np.linalg.det(R) < 0:
        # flip the least-significant principal direction to keep a pure rotation
        targets[:, 2] *= -1
        R = targets @ evecs.T
    m = mathutils.Matrix([[R[r][c] for c in range(3)] + [0] for r in range(3)] +
                         [[0, 0, 0, 1]])
    ob.data.transform(m)
    print('  pca_level: corrected up to %.1f deg of lean' % max_tilt)


def orient_by_ratio(ob, exp):
    """Pick the up axis whose span ratios best match the expected (w, d, h),
    then rotate it to +Z. Sign flips are handled by FIXES after a render check."""
    sp, _, _ = spans(ob)
    eh = exp[2]
    ew = sorted(exp[:2], reverse=True)
    best, best_err = 2, 1e9
    for a in range(3):
        others = sorted([sp[i] for i in range(3) if i != a], reverse=True)
        err = (abs(math.log((others[0] / sp[a]) / (ew[0] / eh))) +
               abs(math.log((others[1] / sp[a]) / (ew[1] / eh))))
        if err < best_err:
            best_err, best = err, a
    if best == 1:
        ob.data.transform(mathutils.Matrix.Rotation(math.radians(90), 4, 'X'))
    elif best == 0:
        ob.data.transform(mathutils.Matrix.Rotation(math.radians(-90), 4, 'Y'))
    print('  orient_by_ratio: up axis %s (err %.3f)' % ('XYZ'[best], best_err))


def axis_sort_orient(ob, order):
    """Permute axes so sorted-span roles land where `order` says.
    order is a tuple of destination axes for (largest, middle, smallest) span,
    e.g. wall: largest->x(0), middle->z(2), smallest->y(1) = (0, 2, 1)."""
    sp, _, _ = spans(ob)
    ranked = sorted(range(3), key=lambda a: -sp[a])  # src axes by span desc
    perm = [None, None, None]
    for role, src in enumerate(ranked):
        perm[order[role]] = src  # dest axis <- src axis
    m = mathutils.Matrix.Identity(4)
    for dest in range(3):
        for c in range(4):
            m[dest][c] = 0.0
        m[dest][perm[dest]] = 1.0
    # keep it a rotation (det +1) to avoid mirroring: flip one axis if needed
    if m.to_3x3().determinant() < 0:
        for c in range(3):
            m[1][c] = -m[1][c]
    ob.data.transform(m)


def apply_fixes(ob, name):
    f = FIXES.get(name)
    if not f:
        return
    for ax, deg in f.items():
        m = mathutils.Matrix.Rotation(math.radians(deg), 4, ax.upper())
        ob.data.transform(m)
    print('  applied FIX %r' % (f,))


def scale_nonuniform(ob, sx, sy, sz):
    sp, mn, mx = spans(ob)
    cx, cy = (mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2
    for v in ob.data.vertices:
        v.co.x = (v.co.x - cx) * sx
        v.co.y = (v.co.y - cy) * sy
        v.co.z = (v.co.z - mn[2]) * sz


def cut_doorway(ob, w, h):
    """Boolean-cut a centered w x h doorway through the wall's full depth."""
    sp, mn, mx = spans(ob)
    depth = sp[1] * 4
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_cube_add(size=1)
    cutter = bpy.context.view_layer.objects.active
    cutter.scale = (w, depth, h + 0.1)
    cutter.location = (0, (mn[1] + mx[1]) / 2, (h + 0.1) / 2 - 0.1)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    mod = ob.modifiers.new('door', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = cutter
    mod.solver = 'EXACT'
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier='door')
    bpy.data.objects.remove(cutter)
    # report the actual opening: any verts left inside the cut region?
    inside = [v for v in ob.data.vertices
              if abs(v.co.x) < w / 2 - 0.05 and 0.05 < v.co.z < h - 0.05
              and mn[1] + 0.01 < v.co.y < mx[1] - 0.01]
    print('  doorway cut %.2f x %.2f (verts left mid-opening: %d — cut faces only is fine)'
          % (w, h, len(inside)))


def render_piece(ob, name, out_png, azimuth_deg, elev_deg=46):
    scene = bpy.context.scene
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            scene.render.engine = eng
            break
        except Exception:
            pass
    # hide everything but this piece
    for o in bpy.data.objects:
        if o.type == 'MESH':
            o.hide_render = (o is not ob)
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
    sp, mn, mx = spans(ob)
    center = mathutils.Vector(((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2))
    radius = max(sp) * 0.75 + 0.5
    az = math.radians(azimuth_deg)
    el = math.radians(elev_deg)
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


def process(name, cfg):
    print('=== %s ===' % name)
    raw = os.path.join(SRC_DIR, cfg.get('raw', 'rodin_%s_raw.glb' % name))
    meshes = rp.import_raw(raw)
    ob = rp.join_parts(meshes)
    img = rp.find_diffuse(ob)
    if img:
        img = img.copy()  # never touch the original datablock
    rp.collapse_material(ob, name + '_Mat', img)
    # purge orphans from the raw import
    for _ in range(3):
        bpy.ops.outliner.orphans_purge(do_local_ids=True, do_recursive=True)

    mode = cfg['mode']
    if cfg.get('level', True):
        pca_level(ob)
    if mode == 'wall':
        axis_sort_orient(ob, (0, 2, 1))   # longest->x, middle->z(height), thinnest->y
    elif mode == 'roof':
        axis_sort_orient(ob, (0, 1, 2))   # two largest->x,y, thinnest->z
    elif cfg.get('orient') == 'ratio':
        orient_by_ratio(ob, cfg['exp'])
    elif cfg.get('orient') == 'none':
        pass
    else:
        rp.orient_upright(ob)
    apply_fixes(ob, name)

    sp, mn, mx = spans(ob)
    if mode == 'wall':
        sx = cfg['L'] / sp[0]
        sz = cfg['H'] / sp[2]
        nat_t = sp[1] * (sx + sz) / 2
        t = min(max(nat_t, cfg['Tmin']), cfg['Tmax'])
        scale_nonuniform(ob, sx, t / sp[1], sz)
    elif mode == 'roof':
        sx = cfg['L'] / sp[0]
        sy = cfg['W'] / sp[1]
        nat_h = sp[2] * (sx + sy) / 2
        h = min(max(nat_h, cfg['Hmin']), cfg['Hmax'])
        scale_nonuniform(ob, sx, sy, h / sp[2])
    else:
        s = cfg['W'] / max(sp[0], sp[1]) if 'W' in cfg else cfg['H'] / sp[2]
        scale_nonuniform(ob, s, s, s)

    if 'door' in cfg:
        cut_doorway(ob, cfg['door']['w'], cfg['door']['h'])

    tris = rp.decimate(ob, TARGET_TRIS)
    sp, mn, mx = spans(ob)
    print('  FINAL dims (blender x*y*z = game w*d*h): %.3f x %.3f x %.3f | tris %d'
          % (sp[0], sp[1], sp[2], tris))

    ob.name = name
    # check renders: front 3/4 and back 3/4 at the game's ~46 deg pitch
    render_piece(ob, name, os.path.join(RENDERS, name + '_front34.png'), azimuth_deg=30)
    render_piece(ob, name, os.path.join(RENDERS, name + '_back34.png'), azimuth_deg=210)
    if 'door' in cfg:
        render_piece(ob, name, os.path.join(RENDERS, name + '_doorfront.png'),
                     azimuth_deg=0, elev_deg=10)

    # export this piece alone
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    out = os.path.join(MODELS, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True)
    print('  exported %s (%.2f MB)' % (out, os.path.getsize(out) / 1e6))
    return ob


def main():
    only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else None
    blend = os.path.join(SRC_DIR, 'ComputerKit.blend')
    if only and os.path.exists(blend):
        # incremental: rebuild only the named pieces inside the existing blend
        bpy.ops.wm.open_mainfile(filepath=blend)
        for nm in only:
            ob = bpy.data.objects.get(nm)
            if ob:
                bpy.data.objects.remove(ob, do_unlink=True)
    else:
        # clean default scene
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.delete()
    for ob_name, cfg in PIECES:
        if only and ob_name not in only:
            continue
        process(ob_name, cfg)
    for o in bpy.data.objects:
        o.hide_render = False
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC_DIR, 'ComputerKit.blend'))
    print('=== ComputerKit build complete ===')


main()
