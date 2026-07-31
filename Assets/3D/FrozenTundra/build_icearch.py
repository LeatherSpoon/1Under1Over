# build_icearch.py — the Frozen Tundra's hero landmark: a great natural ice
# arch standing on the arch plaza (glacier.js ICE_ARCH, shelf 3 at y 8.0).
#
# WHY IT EXISTS. The zone had nothing to walk toward — the north third of every
# frame was empty gradient, and the only authored landmark was a shrine the
# size of a bucket. This is the silhouette the whole stepped climb points at,
# sized to read from the spawn portal ~45 units south.
#
# Native ~18 wide × 12.6 tall × 2.4 deep, placed at scale 1.0. Sweep: a single
# arc from ground, over, and back down, with a cross-section that is fat at the
# feet and slim at the crown. The section is a SLAB (deeper than it is wide at
# the crown) rather than a tube — a round arch reads as a noodle at the fixed
# ortho camera, a slab keeps a clean edge.
#
# The glow vein is the zone's only emissive. It gives the arch a reason to be a
# destination after dark and something for the aurora to answer.
#
# Run headless:  blender -b --python build_icearch.py
# Outputs models/Tundra_IceArch.glb; source IceArch.blend (watched).
import bpy, bmesh, math, os, random, traceback
from mathutils import Vector

OUT_GLB = r'D:\1Under1OverToo\models\Tundra_IceArch.glb'
OUT_BLEND = r'D:\1Under1OverToo\Assets\3D\FrozenTundra\IceArch.blend'
RENDER = r'C:\Users\Owner\AppData\Local\Temp\claude\D--Resume-Korina\ce393615-b0dc-435b-b9b1-88d43dac307d\scratchpad\icearch_check.png'

W_ARCH, H_ARCH, DEPTH = 18.0, 12.6, 2.4
R_FOOT, R_CROWN = 2.05, 1.05


def lin(h):
    v = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in v) + (1.0,)


def mat(name, h, emissive=None, strength=1.6, cull=True):
    """cull=False for OPEN STRIPS (the cap, the underside band, the glow vein).
    bmesh.ops.recalc_face_normals gives an open strip an arbitrary — not
    wrong, just unpredictable — orientation, so half of them end up culled and
    invisible. Solid closed masses keep culling; ribbons are double-sided."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = lin(h)
    b.inputs['Roughness'].default_value = 0.8
    if emissive:
        b.inputs['Emission Color'].default_value = lin(emissive)
        b.inputs['Emission Strength'].default_value = strength
    m.use_backface_culling = cull
    return m


def finish(bm, name, material, parts, recalc=False):
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    for p in me.polygons:
        p.use_smooth = False
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    parts.append(ob)
    return ob



def rock_into(bm, cx, cy, cz, s, rnd, subdiv=2):
    """A noise-displaced rock blob merged into `bm`.

    create_icosphere(subdivisions=1) is 80 flat triangles, and at the game's
    camera every one of them is legible — the owner flagged exactly this ("I
    can see the primitive triangles"). Three subdivisions plus per-vertex
    displacement gives a silhouette that reads as broken ice rather than a
    faceted ball. Two subdivisions, not three: these are ~20px on screen and
    the shelf wall carrying them is instanced ~30x across the zone."""
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=subdiv, radius=s)
    ax, ay, az = rnd.uniform(0, 9), rnd.uniform(0, 9), rnd.uniform(0, 9)
    sx, sy, sz = (0.72 + rnd.random() * 0.6, 0.72 + rnd.random() * 0.6, 0.62 + rnd.random() * 0.5)
    for v in tmp.verts:
        n = (math.sin(v.co.x * 3.1 + ax) * math.cos(v.co.y * 2.7 + ay)
             + 0.55 * math.sin(v.co.z * 5.3 + az) * math.cos(v.co.x * 4.1 + ay)
             + 0.30 * math.sin(v.co.y * 8.7 + az))
        v.co *= 1.0 + 0.17 * n
        v.co.x *= sx; v.co.y *= sy; v.co.z *= sz
        v.co.x += cx; v.co.y += cy; v.co.z += cz
    me = bpy.data.meshes.new('tmp')
    tmp.to_mesh(me); tmp.free()
    bm.from_mesh(me); bpy.data.meshes.remove(me)


# ── The sweep ────────────────────────────────────────────────────────────────
def path_at(t):
    """Centreline point. sin^0.72 keeps the legs steep and the crown broad."""
    x = -W_ARCH / 2 * math.cos(math.pi * t)
    z = H_ARCH * math.sin(math.pi * t) ** 0.72
    return Vector((x, 0.0, z))


def radius_at(t):
    s = math.sin(math.pi * t)
    return R_CROWN + (R_FOOT - R_CROWN) * (1 - s) ** 1.4


def frame_at(t):
    d = 1e-3
    tan = (path_at(min(1, t + d)) - path_at(max(0, t - d))).normalized()
    inplane = Vector((-tan.z, 0.0, tan.x))          # perpendicular, still in XZ
    return tan, inplane, Vector((0.0, 1.0, 0.0))


def section(bm, t, n, rscale=1.0, dscale=1.0, wob=0.0):
    """A superelliptic slab ring perpendicular to the sweep."""
    c = path_at(t)
    _, ip, dp = frame_at(t)
    r = radius_at(t) * rscale
    dep = DEPTH / 2 * dscale
    ring = []
    for i in range(n):
        a = 2 * math.pi * i / n
        ca, sa = math.cos(a), math.sin(a)
        # superellipse (exponent < 1 on the magnitude → squarer than a circle)
        px = math.copysign(abs(ca) ** 0.72, ca)
        py = math.copysign(abs(sa) ** 0.72, sa)
        jitter = 1.0 + wob * math.sin(a * 3 + t * 17.0)
        p = c + ip * (px * r * jitter) + dp * (py * dep * jitter)
        ring.append(bm.verts.new((p.x, p.y, p.z)))
    return ring


try:
    bpy.ops.wm.read_homefile(use_empty=True)
    rnd = random.Random(20260727)

    ICE      = mat('IA_Ice',     '8fc0dd')
    ICE_DEEP = mat('IA_IceDeep', '3c7fa8', cull=False)
    SNOW     = mat('IA_Snow',    'f4f9ff', cull=False)
    ICICLE   = mat('IA_Icicle',  'b6e0f0')
    VEIN     = mat('IA_GlowVein', '2a6f8f', emissive='9ff0ff', strength=4.2, cull=False)
    INK      = mat('IA_Ink',     '000000')

    parts = []
    NSEG, NRING = 46, 12

    # ── Body ────────────────────────────────────────────────────────────────
    bm = bmesh.new()
    rings = [section(bm, i / NSEG, NRING, wob=0.055) for i in range(NSEG + 1)]
    for a, b in zip(rings, rings[1:]):
        for i in range(NRING):
            bm.faces.new((a[i], a[(i + 1) % NRING], b[(i + 1) % NRING], b[i]))
    bm.faces.new(tuple(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bm.normal_update()
    body = finish(bm, 'IceArch_Body', ICE, parts, recalc=True)

    # ── Deep-ice underside ──────────────────────────────────────────────────
    # The inner curve of the span, in the darker ice — this is the value that
    # makes the arch read as a hole in something solid rather than a hoop.
    bmu = bmesh.new()
    ulast = None
    for i in range(NSEG + 1):
        t = i / NSEG
        c = path_at(t)
        _, ip, dp = frame_at(t)
        # OUTSIDE the body surface, not inside it. The body is a closed tube;
        # a strip at 0.93r is buried in it and renders nothing (the snow cap
        # works precisely because it is offset outward).
        r = radius_at(t) * 1.008
        row = []
        for j in range(5):
            a = math.pi * 0.62 + math.pi * 0.76 * j / 4      # the inner-facing arc
            p = c + ip * (-math.cos(a) * r) + dp * (math.sin(a) * DEPTH / 2 * 1.008)
            row.append(bmu.verts.new((p.x, p.y, p.z)))
        if ulast:
            for j in range(4):
                bmu.faces.new((ulast[j], row[j], row[j + 1], ulast[j + 1]))
        ulast = row
    bmu.normal_update()
    finish(bmu, 'IceArch_Under', ICE_DEEP, parts, recalc=True)

    # ── Snow cap along the top of the sweep ─────────────────────────────────
    bmc = bmesh.new()
    clast = None
    for i in range(NSEG + 1):
        t = i / NSEG
        c = path_at(t)
        _, ip, dp = frame_at(t)
        r = radius_at(t)
        lift = 0.10 + 0.05 * math.sin(t * 21.0)
        row = []
        for j in range(5):
            a = -math.pi * 0.38 + math.pi * 0.76 * j / 4    # the outward/upward arc
            p = c + ip * (math.cos(a) * (r + lift)) + dp * (math.sin(a) * (DEPTH / 2 + lift))
            row.append(bmc.verts.new((p.x, p.y, p.z)))
        if clast:
            for j in range(4):
                bmc.faces.new((clast[j], row[j], row[j + 1], clast[j + 1]))
        clast = row
    bmc.normal_update()
    cap = finish(bmc, 'IceArch_Cap', SNOW, parts, recalc=True)

    # ── Glow vein — a lit crack up the CAMERA-FACING face ───────────────────
    # It first ran along the inner curve of the span, which the game's 46°
    # camera never sees: the span occludes its own soffit from above, so the
    # vein rendered identically to having no vein at all. glTF maps Blender −Y
    # to game +Z, so −Y is the face the player looks at — the seam belongs
    # there, wandering up the flank where it reads against the pale ice.
    bmv = bmesh.new()
    vlast = None
    for i in range(NSEG + 1):
        t = i / NSEG
        if t < 0.10 or t > 0.90:
            vlast = None
            continue
        c = path_at(t)
        _, ip, dp = frame_at(t)
        r = radius_at(t)
        snake = 0.42 * math.sin(t * 8.7 + 0.6) + 0.14 * math.sin(t * 19.0)
        halfw = 0.055 + 0.045 * math.sin(t * 11.0)
        row = []
        for j in (-1, 1):
            p = (c + ip * ((snake + j * halfw) * r)
                   + dp * (-(DEPTH / 2) * 1.015))
            row.append(bmv.verts.new((p.x, p.y, p.z)))
        if vlast:
            bmv.faces.new((vlast[0], row[0], row[1], vlast[1]))
        vlast = row
    bmv.normal_update()
    finish(bmv, 'IceArch_GlowVein', VEIN, parts, recalc=True)

    # ── Icicles under the crown ─────────────────────────────────────────────
    bmi = bmesh.new()
    for _ in range(26):
        t = rnd.uniform(0.24, 0.76)
        c = path_at(t)
        _, ip, _ = frame_at(t)
        r = radius_at(t)
        base = c + ip * (-r * 0.80) + Vector((0, rnd.uniform(-DEPTH * 0.34, DEPTH * 0.34), 0))
        ln = rnd.uniform(0.5, 1.9)
        rr = rnd.uniform(0.055, 0.13)
        top = [bmi.verts.new((base.x + rr * math.cos(a), base.y + rr * math.sin(a), base.z))
               for a in (0, 2.094, 4.189)]
        tip = bmi.verts.new((base.x, base.y, base.z - ln))
        for k in range(3):
            bmi.faces.new((top[k], top[(k + 1) % 3], tip))
        bmi.faces.new(tuple(reversed(top)))
    bmi.normal_update()
    finish(bmi, 'IceArch_Icicles', ICICLE, parts, recalc=True)

    # ── Rubble skirt at both feet ───────────────────────────────────────────
    bmr = bmesh.new()
    for foot in (-W_ARCH / 2, W_ARCH / 2):
        for _ in range(14):
            a = rnd.uniform(0, 2 * math.pi)
            d = rnd.uniform(1.4, 3.4)
            s = rnd.uniform(0.20, 0.62)
            rock_into(bmr, foot + math.cos(a) * d, math.sin(a) * d * 0.7, s * 0.4, s, rnd)
    bmr.normal_update()
    finish(bmr, 'IceArch_Rubble', ICE, parts)

    # ── Baked outline hull over the solid masses ────────────────────────────
    bmh = bmesh.new()
    for o in (body, cap):
        tmp = bmesh.new()
        tmp.from_mesh(o.data)
        tmp.normal_update()
        for v in tmp.verts:
            v.co += v.normal * 0.075
        me = bpy.data.meshes.new('tmp'); tmp.to_mesh(me); tmp.free()
        bmh.from_mesh(me); bpy.data.meshes.remove(me)
    bmesh.ops.reverse_faces(bmh, faces=bmh.faces)
    finish(bmh, 'IceArch_OutlineHull', INK, parts)

    # ── Export ──────────────────────────────────────────────────────────────
    coll = bpy.data.collections.new('Tundra_IceArch')
    bpy.context.scene.collection.children.link(coll)
    coll['export_offset'] = [0.0, 0.0, 0.0]
    for o in parts:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)

    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)

    # ── Check render at the game's 46° ──────────────────────────────────────
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            bpy.context.scene.render.engine = eng
            break
        except Exception:
            pass
    for o in bpy.context.scene.objects:
        if o.name.endswith('_OutlineHull'):
            o.hide_render = True      # EEVEE ignores the cull flag; three.js does not
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3.2
    sun.rotation_euler = (0.9, 0.05, 0.7)
    bpy.context.scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 26
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    target = Vector((0, 0, 5.5))
    cam.location = target + Vector((0.30, -0.66, 0.69)) * 40
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.resolution_x = 900
    bpy.context.scene.render.resolution_y = 800
    bpy.context.scene.render.filepath = RENDER
    bpy.ops.render.render(write_still=True)

    vs = [(v.co.x, v.co.y, v.co.z) for o in parts for v in o.data.vertices]
    mn = [min(p[i] for p in vs) for i in range(3)]
    mx = [max(p[i] for p in vs) for i in range(3)]
    print('ICEARCH_OK %.0fKB  x[%.2f,%.2f] y[%.2f,%.2f] z[%.2f,%.2f]'
          % (os.path.getsize(OUT_GLB) / 1024, mn[0], mx[0], mn[1], mx[1], mn[2], mx[2]))
except Exception:
    print('ICEARCH_FAIL: ' + traceback.format_exc()[-2000:])
