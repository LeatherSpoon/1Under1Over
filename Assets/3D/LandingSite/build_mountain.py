# build_mountain.py — authors Landing_Mountain.glb, the Landing Site's ridge.
#
#   blender -b --factory-startup --python Assets/3D/LandingSite/build_mountain.py
#
# WHY. The mountain is the landmark the tutorial path walks you toward, and the
# owner asked for it rebuilt as sculpted geometry with the mine mouth cut into
# the rock. Draft 1 lofted six low-poly cones and read as exactly that next to
# the Rodin-sculpted adit prop. Draft 2 voxel-remeshed the masses into one body
# but displaced it too gently and baked too softly — it read as a grey dough
# lump. This build is the one that holds up: deep voronoi-crackle displacement
# so the surface is angular rock plates, auto-smooth shading so crack edges
# stay crisp, and a 2048 bake (tone zones + snowfields + foot grass-blend +
# AO + pocket depth-darkening) so it rides the same textured-toon path as the
# Rodin props beside it.
#
# THE MOUTH. `Landing_MineAdit.glb` is a FACADE — timber portal + rock surround
# + its own dark panel, 1.2 deep, fronting +game-z natively. The mountain's job
# is to present a FLAT face normal to the 45-degree approach bearing and a snug
# arched pocket the surround beds into. Draft 1 failed this twice: the cutter's
# rotation (-ADIT_DIR - pi/2) pointed the tunnel OUTWARD, leaving a 1.6-deep
# notch with the ember glow entombed in solid rock, and the face it cut into
# belonged to an off-axis mass whose local normal is ~65 degrees — which is
# what the owner flagged as "the frame is not normal to the mountain". Now the
# face is flattened onto the bearing plane before the cut, a bastion mass
# centred ON the bearing keeps rock on both pocket walls (the off-axis shoulder
# let the cut break through the flank into open air), and ray probes assert
# mouth depth and wall enclosure so those failures can't ship again.
#
# THE INK. Not the smooth-envelope recipe (hull_envelope.py) — at this scale it
# produced a fat rind with dropouts (clearance error rivals the ink width).
# Ink weight is a SCREEN-SPACE aesthetic: trees carry ~0.05-unit shells, so a
# 26-unit landform wants ~0.10, not the 0.30 draft 2 used. The hull here is a
# same-topology copy of the FINAL cut rock, every vertex offset 0.10 along its
# averaged normal, faces flipped — it tracks every bump and the pocket rim by
# construction, needs no clearance verification, and crack-crossings just read
# as cavity ink. Flip LAST: the EXACT boolean solver re-normalizes orientation
# and silently undoes an early flip (draft 2 shipped a black-shell mountain
# that way; signed-volume asserts pin both meshes now).
#
# CONVENTIONS. Game (x, z) = Blender (x, -y); heights on Blender Z. Authored at
# true world scale, centred on CONFIG.MOUNTAIN_POS and grounded at z = 0, so
# the ZoneAssets placement is scale 1.0 / rotY 0. sRGB hexes are converted to
# linear before node assignment. Prints JS-facing numbers at the end (face
# plane, landAdit seating).

import bpy, bmesh, math, os, random
from mathutils import Vector
from mathutils.bvhtree import BVHTree

OUT_DIR = r'D:\1Under1OverToo\models'
BLEND = r'D:\1Under1OverToo\Assets\3D\LandingSite\Mountain.blend'
BAKE_PNG = r'D:\1Under1OverToo\Assets\3D\LandingSite\mountain_bake.png'

ADIT_DIR = math.pi / 4          # game-space bearing of the mouth (toward the pad)
T_FACE = 9.6                    # bearing distance of the flattened portal face
POCKET_W, POCKET_WALL, POCKET_D = 3.5, 2.3, 2.2   # arch cut, snug to the prop
INK_T = 0.13                    # hull offset — tree shells run ~0.05; landmark weight

ROCK_DK, ROCK_LT, WARM = '565d66', 'a8adb4', '80776a'
GRASS, SNOW = '5f8f42', 'edf1f6'


def lin(h):
    v = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in v) + (1.0,)


def gb(gx, gz):
    """Game (x, z) -> Blender (x, y)."""
    return gx, -gz


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def link_obj(name, me):
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def evaluated_swap(ob):
    """Apply the object's modifier stack by depsgraph evaluation."""
    deps = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(deps))
    ob.modifiers.clear()
    old = ob.data
    ob.data = me
    bpy.data.meshes.remove(old)
    return ob


def drop_islands(ob, min_verts=150):
    """Booleans can shave off floating slivers (draft 2 left white chips over
    the lintel) — delete every component smaller than min_verts."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    visited, comps = set(), []
    for v in bm.verts:
        if v in visited:
            continue
        stack, seen = [v], set()
        while stack:
            u = stack.pop()
            if u in seen:
                continue
            seen.add(u)
            for e in u.link_edges:
                w = e.other_vert(u)
                if w not in seen:
                    stack.append(w)
        visited |= seen
        comps.append(seen)
    comps.sort(key=len, reverse=True)
    doomed = [v for c in comps[1:] for v in c if len(c) < min_verts]
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context='VERTS')
    bm.to_mesh(ob.data)
    bm.free()
    return len(comps)


def base_mass(bm, gx, gz, base_r, height, seed, n=14, rings=6):
    """Smooth convex loft — just a base hull; displacement does the rock."""
    rnd = random.Random(seed)
    cx, cy = gb(gx, gz)
    ph = rnd.uniform(0, 6.28)
    wob = [1 + 0.10 * math.sin(3 * (i / n * 2 * math.pi) + ph) for i in range(n)]
    loops = []
    for k in range(rings):
        t = k / (rings - 1)
        # +0.55 keeps summit tips fat enough for the 0.35 voxel remesh — a
        # 0.18 needle aliased into funnel/shard garbage at two peaks.
        r = base_r * (1 - t) ** 0.80 + 0.55
        # Bottom ring sunk 1.6 below grade: the rim wedge is otherwise a thin
        # near-horizontal plate that displacement shreds into floating
        # pancakes at the skirt (drafts 4-5, green flaps).
        z = height * (t ** 0.85) if k else -1.6
        loop = [bm.verts.new((cx + r * wob[i] * math.cos(i / n * 2 * math.pi),
                              cy + r * wob[i] * math.sin(i / n * 2 * math.pi), z))
                for i in range(n)]
        loops.append(loop)
    for a, b in zip(loops, loops[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(tuple(reversed(loops[0])))
    bm.faces.new(loops[-1])


def make_cutter(name, w, wall_h, depth):
    """Arched pocket cutter: rect + semicircle profile, extruded along local +y,
    which the rotation below maps to the INWARD bearing (asserted by probe)."""
    bm = bmesh.new()
    hw = w * 0.5
    prof = []
    for i in range(9):
        a = math.pi - i / 8 * math.pi
        prof.append((hw * math.cos(a), wall_h + hw * 0.72 * math.sin(a)))
    prof.append((hw, -0.4))
    prof.append((-hw, -0.4))
    front, back = [], []
    for (px, pz) in prof:
        front.append(bm.verts.new((px, -1.8, pz)))   # proud of the face
        back.append(bm.verts.new((px, depth, pz)))   # into the rock
    n = len(prof)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bm.faces.new(tuple(reversed(front)))
    bm.faces.new(back)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link_obj(name, me)
    ox, oy = gb(math.cos(ADIT_DIR) * T_FACE, math.sin(ADIT_DIR) * T_FACE)
    ob.location = (ox, oy, 0.0)
    # Local +y -> Blender (-sin t, cos t); inward (toward the mountain centre)
    # is Blender angle (3pi/4) for a pi/4 game bearing => t = -ADIT_DIR + pi/2.
    # Draft 1 had -pi/2 here and carved the tunnel out into open air.
    ob.rotation_euler = (0.0, 0.0, -ADIT_DIR + math.pi / 2)
    return ob


def boolean_cut(target, cutter):
    m = target.modifiers.new('cut', 'BOOLEAN')
    m.operation = 'DIFFERENCE'
    m.object = cutter
    m.solver = 'EXACT'
    try:
        m.use_self = True
    except AttributeError:
        pass
    evaluated_swap(target)


clear()

# ── One landform ─────────────────────────────────────────────────────────────
# High ground north-west, falling toward the approach. Bases overlap hard —
# the remesh welds them into one mass.
MASSES = [
    (-1.2, -2.2,  6.6, 14.4, 11),   # main peak
    ( 2.9, -4.4,  5.2, 10.6, 22),   # north sister
    (-5.4, -0.9,  5.6,  9.2, 33),   # west shoulder
    (-3.6,  3.4,  5.0,  6.8, 44),   # south spur
    ( 4.8,  3.8,  5.2,  6.8, 55),   # south-east shoulder
    ( 5.2,  5.2,  4.6,  6.4, 88),   # portal bastion — centred ON the adit bearing
    ( 6.2, -1.2,  4.6,  7.6, 66),   # east buttress
    ( 0.5,  4.6,  4.2,  4.6, 99),   # south-face filler — without it the spur/
                                    # bastion gap baked a sooty AO hollow that
                                    # read as a phantom cave next to the real one
    (-0.8,  1.6,  4.4,  5.6, 111),  # basin dome — second AO pit, mid south face
    ( 0.0,  0.3,  9.0,  5.4, 77),   # welding apron — steeper than draft 4's,
                                    # whose thin 3.6-high rim shredded into
                                    # floating green sheets under displacement
]
bm = bmesh.new()
for (gx, gz, r, h, s) in MASSES:
    base_mass(bm, gx, gz, r, h, s)
me = bpy.data.meshes.new('Mountain_Rock')
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(me)
bm.free()
rock = link_obj('Mountain_Rock', me)

# Remesh to one watertight surface, then displace: big mass variation, DEEP
# sunken voronoi cells (angular rock plates — the reason this reads as crag
# instead of dough), fine rubble grain.
rm = rock.modifiers.new('rm', 'REMESH')
rm.mode = 'VOXEL'
rm.voxel_size = 0.35

t_big = bpy.data.textures.new('mtn_big', 'CLOUDS')
t_big.noise_scale = 6.5
t_big.noise_depth = 4
t_crack = bpy.data.textures.new('mtn_crack', 'VORONOI')
t_crack.noise_scale = 4.5
# F2-F1: plateau per cell, valleys at borders -> pillow-plates split by
# crevices. The default (F1 only) is soft bumps — draft 3's "crackle" never
# actually happened because of it.
t_crack.weight_1 = -1.0
t_crack.weight_2 = 1.0
t_fine = bpy.data.textures.new('mtn_fine', 'CLOUDS')
t_fine.noise_scale = 1.1
t_fine.noise_depth = 2
for tex, strength in ((t_big, 2.1), (t_crack, 2.3), (t_fine, 0.45)):
    d = rock.modifiers.new('d', 'DISPLACE')
    d.texture = tex
    d.texture_coords = 'LOCAL'
    d.strength = strength
    d.mid_level = 0.5
evaluated_swap(rock)

# ── Flatten the portal face ──────────────────────────────────────────────────
# Pull rock protruding past the bearing-normal plane at T_FACE back onto it
# (and nudge shallow hollows out), elliptical falloff so it reads as a quarried
# face, not a dinner plate. 8% of the relief is left in place.
ubx, uby = gb(math.cos(ADIT_DIR), math.sin(ADIT_DIR))
mx, my = gb(math.cos(ADIT_DIR) * T_FACE, math.sin(ADIT_DIR) * T_FACE)
MZ = 1.9
bm = bmesh.new()
bm.from_mesh(rock.data)
for v in bm.verts:
    rx, ry, rz = v.co.x - mx, v.co.y - my, v.co.z - MZ
    d = rx * ubx + ry * uby
    hx, hy = rx - d * ubx, ry - d * uby
    lat = math.sqrt(hx * hx + hy * hy + (rz / 1.15) ** 2)
    if lat > 6.4:
        continue
    w = 1.0 if lat < 3.9 else 1.0 - ((lat - 3.9) / 2.5) ** 2
    if d > 0:
        pull = d * 0.92 * w
        v.co.x -= ubx * pull
        v.co.y -= uby * pull
    elif d > -0.9:
        push = min(-d, 0.9) * 0.75 * w
        v.co.x += ubx * push
        v.co.y += uby * push
bm.to_mesh(rock.data)
bm.free()

# Decimate to a props budget (rock + same-topology hull ship together).
rock.data.calc_loop_triangles()
if len(rock.data.loop_triangles) > 21000:
    dec = rock.modifiers.new('dec', 'DECIMATE')
    dec.ratio = 20000 / len(rock.data.loop_triangles)
    evaluated_swap(rock)

# ── Cut the pocket, clean up boolean slivers ─────────────────────────────────
boolean_cut(rock, make_cutter('cut_rock', POCKET_W, POCKET_WALL, POCKET_D))
bpy.data.objects.remove(bpy.data.objects['cut_rock'], do_unlink=True)
drop_islands(rock)

# Crisp crack edges, smooth faces between.
bpy.ops.object.select_all(action='DESELECT')
rock.select_set(True)
bpy.context.view_layer.objects.active = rock
bpy.ops.object.shade_auto_smooth(angle=math.radians(42.0))

# ── Ink hull: same-topology normal-offset shell of the FINAL rock ────────────
hull = rock.copy()
hull.data = rock.data.copy()
hull.name = hull.data.name = 'Mountain_OutlineHull'
bpy.context.collection.objects.link(hull)
bm = bmesh.new()
bm.from_mesh(hull.data)
bm.normal_update()
# Offset along neighbor-smoothed normals: raw crease normals threw sliver
# chips off the surface (floating black flecks against the sky).
nrm = {v: v.normal.copy() for v in bm.verts}
for _ in range(2):
    nn = {}
    for v in bm.verts:
        acc = nrm[v].copy()
        for e in v.link_edges:
            acc += nrm[e.other_vert(v)]
        nn[v] = acc.normalized()
    nrm = nn
for v in bm.verts:
    v.co += nrm[v] * INK_T
bmesh.ops.reverse_faces(bm, faces=bm.faces)
bm.to_mesh(hull.data)
bm.free()

# ── UV + baked diffuse ───────────────────────────────────────────────────────
bpy.ops.object.select_all(action='DESELECT')
rock.select_set(True)
bpy.context.view_layer.objects.active = rock
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
# 89 degrees: at 66 the crackle creases exploded the atlas into confetti —
# thousands of few-triangle islands, most of the 2048 left black, effective
# texel density near zero, and the whole bake read as blur.
bpy.ops.uv.smart_project(angle_limit=math.radians(89.0), island_margin=0.005)
bpy.ops.object.mode_set(mode='OBJECT')

zmax = max(v.co.z for v in rock.data.vertices)
img = bpy.data.images.new('MtnBake', 2048, 2048, alpha=False)

bake_mat = bpy.data.materials.new('MtnBakeSrc')
bake_mat.use_nodes = True
nt = bake_mat.node_tree
bsdf = nt.nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = 1.0


def _sock(node, name, kind, out=False):
    for s in (node.outputs if out else node.inputs):
        if s.name == name and s.type == kind:
            return s
    raise KeyError(name)


def mixc(fac, a, b, blend='MIX'):
    n = nt.nodes.new('ShaderNodeMix')
    n.data_type = 'RGBA'
    n.blend_type = blend
    fs = n.inputs['Factor']
    if isinstance(fac, (int, float)):
        fs.default_value = fac
    else:
        nt.links.new(fac, fs)
    for nm_, val in (('A', a), ('B', b)):
        s = _sock(n, nm_, 'RGBA')
        if isinstance(val, tuple):
            s.default_value = val
        else:
            nt.links.new(val, s)
    return _sock(n, 'Result', 'RGBA', out=True)


def fmath(op, a, b):
    n = nt.nodes.new('ShaderNodeMath')
    n.operation = op
    for i, val in enumerate((a, b)):
        if isinstance(val, (int, float)):
            n.inputs[i].default_value = val
        else:
            nt.links.new(val, n.inputs[i])
    return n.outputs[0]


def maprange(val, fmin, fmax, tmin, tmax, smooth=True):
    n = nt.nodes.new('ShaderNodeMapRange')
    n.interpolation_type = 'SMOOTHSTEP' if smooth else 'LINEAR'
    n.clamp = True
    nt.links.new(val, n.inputs['Value'])
    n.inputs['From Min'].default_value = fmin
    n.inputs['From Max'].default_value = fmax
    n.inputs['To Min'].default_value = tmin
    n.inputs['To Max'].default_value = tmax
    return n.outputs['Result']


def gray(fac):
    comb = nt.nodes.new('ShaderNodeCombineColor')
    for i in range(3):
        nt.links.new(fac, comb.inputs[i])
    return comb.outputs[0]


tc = nt.nodes.new('ShaderNodeTexCoord')
sep = nt.nodes.new('ShaderNodeSeparateXYZ')
nt.links.new(tc.outputs['Object'], sep.inputs[0])
z = sep.outputs['Z']
geo = nt.nodes.new('ShaderNodeNewGeometry')
sepn = nt.nodes.new('ShaderNodeSeparateXYZ')
nt.links.new(geo.outputs['Normal'], sepn.inputs[0])
nz = sepn.outputs['Z']


def noise(scale, detail):
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
    return n.outputs['Fac']


n_big, n_med, n_fin = noise(0.28, 3.0), noise(1.3, 3.0), noise(4.0, 2.0)

# Rock tone: lighter with height and regional noise, painterly mottle, steep
# faces darker (cliff banding).
# n_big kept light: at 0.5 weight its low regions merged into one broad dark
# continent mid-face that read as a phantom cave (drafts 4-7).
tr = fmath('ADD', fmath('ADD', fmath('MULTIPLY', n_big, 0.30),
                        fmath('MULTIPLY', maprange(z, 0.0, zmax, 0.0, 1.0, False), 0.35)),
           fmath('MULTIPLY', n_med, 0.45))
rock_col = mixc(maprange(tr, 0.25, 0.92, 0.0, 1.0), lin(ROCK_DK), lin(ROCK_LT))
warm_m = fmath('MULTIPLY', maprange(n_big, 0.60, 0.78, 0.0, 1.0), 0.5)
rock_col = mixc(warm_m, rock_col, lin(WARM))
cliff = maprange(nz, 0.15, 0.55, 0.86, 1.0)
rock_col = mixc(1.0, rock_col, gray(cliff), blend='MULTIPLY')

# Per-cell boulder patchwork: a shader-voronoi F1 cell color, flattened to a
# tone jitter — the "pile of distinct boulders" read the adit surround has,
# visible even where geometry smooths out.
vcell = nt.nodes.new('ShaderNodeTexVoronoi')
vcell.inputs['Scale'].default_value = 0.33
nt.links.new(tc.outputs['Object'], vcell.inputs['Vector'])
vbw = nt.nodes.new('ShaderNodeRGBToBW')
nt.links.new(vcell.outputs['Color'], vbw.inputs[0])
cellj = maprange(vbw.outputs['Val'], 0.0, 1.0, 0.82, 1.14, False)
rock_col = mixc(1.0, rock_col, gray(cellj), blend='MULTIPLY')

# Grass-blend foot, capped low so green stays a skirt, not a climb.
gfac = maprange(fmath('SUBTRACT', z, fmath('MULTIPLY', n_med, 0.8)), 0.3, 1.6, 1.0, 0.0)
col = mixc(gfac, rock_col, lin(GRASS))

# Snowfields: high + flat-ish, snowline wavering with the big noise so snow
# follows spurs; fine noise only breaks the edge, not the field.
sline = fmath('ADD', 7.4, fmath('MULTIPLY', n_big, 4.0))
sm = maprange(fmath('SUBTRACT', z, sline), -0.9, 0.4, 0.0, 1.0)
flat_m = maprange(nz, 0.32, 0.58, 0.0, 1.0)
sfac = fmath('MULTIPLY', fmath('MULTIPLY', sm, flat_m),
             maprange(n_fin, 0.0, 1.0, 0.72, 1.0, False))
col = mixc(sfac, col, lin(SNOW))

# Pocket depth-darkening: inside the mouth, fade toward shadow so the facade
# reads as an opening even before its own dark panel takes over. MUST be gated
# by lateral distance from the pocket axis — keyed on bearing-depth alone it
# multiplied the entire body of the mountain behind the face plane by 0.30
# (draft 3's sooty look).
vsub = nt.nodes.new('ShaderNodeVectorMath')
vsub.operation = 'SUBTRACT'
nt.links.new(tc.outputs['Object'], vsub.inputs[0])
vsub.inputs[1].default_value = (mx, my, MZ)
vdot = nt.nodes.new('ShaderNodeVectorMath')
vdot.operation = 'DOT_PRODUCT'
nt.links.new(vsub.outputs['Vector'], vdot.inputs[0])
vdot.inputs[1].default_value = (ubx, uby, 0.0)
vscale = nt.nodes.new('ShaderNodeVectorMath')
vscale.operation = 'SCALE'
vscale.inputs[0].default_value = (ubx, uby, 0.0)
nt.links.new(vdot.outputs['Value'], vscale.inputs['Scale'])
vlat = nt.nodes.new('ShaderNodeVectorMath')
vlat.operation = 'SUBTRACT'
nt.links.new(vsub.outputs['Vector'], vlat.inputs[0])
nt.links.new(vscale.outputs['Vector'], vlat.inputs[1])
vlen = nt.nodes.new('ShaderNodeVectorMath')
vlen.operation = 'LENGTH'
nt.links.new(vlat.outputs['Vector'], vlen.inputs[0])
# Banded in DEPTH as well as laterally: the lateral gate alone measures
# distance from the infinite bearing line, which darkens a tube straight
# through the landform — its wall grazed the visible south face as a baked-in
# smudge that survived four drafts of mass/AO whack-a-mole.
fade_front = maprange(vdot.outputs['Value'], -1.6, 0.3, 1.0, 0.0)
fade_back = maprange(vdot.outputs['Value'], -3.4, -2.2, 0.0, 1.0)
dark_amt = fmath('MULTIPLY', fmath('MULTIPLY', fade_front, fade_back),
                 maprange(vlen.outputs['Value'], 1.9, 3.2, 1.0, 0.0))
dfac = fmath('SUBTRACT', 1.0, fmath('MULTIPLY', dark_amt, 0.70))
col = mixc(1.0, col, gray(dfac), blend='MULTIPLY')

# AO multiplied in — the whole reason the sculpted props read as sculpted.
ao = nt.nodes.new('ShaderNodeAmbientOcclusion')
ao.samples = 8
# Tight radius: crevice ink, not basin gloom — at 6.0 the concavities between
# masses baked into broad sooty hollows.
ao.inputs['Distance'].default_value = 2.6
aof = maprange(ao.outputs['AO'], 0.0, 1.0, 0.52, 1.0, False)
col = mixc(1.0, col, gray(aof), blend='MULTIPLY')
nt.links.new(col, bsdf.inputs['Base Color'])

img_node = nt.nodes.new('ShaderNodeTexImage')
img_node.image = img
nt.nodes.active = img_node

rock.data.materials.clear()
rock.data.materials.append(bake_mat)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 16
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=12)
img.filepath_raw = BAKE_PNG
img.file_format = 'PNG'
img.save()
img.pack()

final_mat = bpy.data.materials.new('MtnRockBaked')
final_mat.use_nodes = True
fnt = final_mat.node_tree
fb = fnt.nodes.get('Principled BSDF')
fb.inputs['Roughness'].default_value = 1.0
try:
    fb.inputs['Specular IOR Level'].default_value = 0.0
except KeyError:
    pass
fimg = fnt.nodes.new('ShaderNodeTexImage')
fimg.image = img
fnt.links.new(fimg.outputs['Color'], fb.inputs['Base Color'])
final_mat.use_backface_culling = True
rock.data.materials.clear()
rock.data.materials.append(final_mat)

ink = bpy.data.materials.new('MtnInk')
ink.use_nodes = True
ink.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (0, 0, 0, 1)
ink.use_backface_culling = True
hull.data.materials.clear()
hull.data.materials.append(ink)

# ── Probes: fail loudly if the mouth is not a real, enclosed, inward pocket ──
deps = bpy.context.evaluated_depsgraph_get()
rock_bvh = BVHTree.FromObject(rock, deps)
ub = Vector((ubx, uby, 0.0))
lat_v = Vector((-uby, ubx, 0.0))


def probe(lat, zq):
    origin = Vector((mx, my, 0)) + ub * 5.0 + lat_v * lat + Vector((0, 0, zq))
    hit = rock_bvh.ray_cast(origin, -ub, 30.0)
    if hit[0] is None:
        return None
    return hit[0].x * ubx + hit[0].y * uby


t_mouth = probe(0.0, 1.4)
t_face_l = probe(2.6, 1.4)
t_face_r = probe(-2.6, 1.4)
t_above = probe(0.0, 4.6)
assert t_mouth is not None and t_mouth < T_FACE - 1.7, \
    'mouth probe hit t=%.2f — pocket missing or cut outward again' % (t_mouth or -1)

# Pocket walls must be enclosed in rock: fire outward from inside the pocket;
# a miss (or a far hit) means the cut broke through the flank into open air.
for sgn in (-1, 1):
    inside = Vector((mx, my, 0)) - ub * 1.2 + Vector((0, 0, 1.5))
    hit = rock_bvh.ray_cast(inside, lat_v * sgn, 30.0)
    dist = (hit[0] - inside).length if hit[0] is not None else 99.0
    assert dist < 4.0, 'pocket wall (side %+d) open to air — ray exits at %.1f' % (sgn, dist)

# Orientation: rock outward (+vol), hull inverted (-vol) — the ink contract.
for ob, want_neg in ((rock, False), (hull, True)):
    b_ = bmesh.new()
    b_.from_mesh(ob.data)
    v_ = b_.calc_volume(signed=True)
    b_.free()
    assert (v_ < 0) == want_neg, '%s signed volume %.0f — orientation wrong' % (ob.name, v_)

# ── Export ───────────────────────────────────────────────────────────────────
parts = [rock, hull]
coll = bpy.data.collections.new('Landing_Mountain')
bpy.context.scene.collection.children.link(coll)
for o in parts:
    for c in list(o.users_collection):
        c.objects.unlink(o)
    coll.objects.link(o)
coll['export_offset'] = (0.0, 0.0, 0.0)

bpy.ops.object.select_all(action='DESELECT')
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = rock
path = os.path.join(OUT_DIR, 'Landing_Mountain.glb')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND)

tris = 0
for o in parts:
    o.data.calc_loop_triangles()
    tris += len(o.data.loop_triangles)
vs = [(o.matrix_world @ v.co) for o in parts for v in o.data.vertices]
# landAdit seating: native front +z at y +0.63, back at y -0.56, scale 1.25;
# sink the back 1.0 behind the face plane -> prop centre t = T_FACE - 1.0 + 0.70.
t_prop = T_FACE - 1.0 + 0.56 * 1.25
px = -18 + math.cos(ADIT_DIR) * t_prop
print('MOUNTAIN3| tris=%d kb=%.1f  x %.2f..%.2f  y %.2f..%.2f  z %.2f..%.2f' % (
    tris, os.path.getsize(path) / 1024,
    min(p.x for p in vs), max(p.x for p in vs),
    min(p.y for p in vs), max(p.y for p in vs),
    min(p.z for p in vs), max(p.z for p in vs)))
print('PROBES| mouth t=%.2f (depth %.2f)  face L/R t=%s/%s  above-arch t=%s' % (
    t_mouth, T_FACE - t_mouth,
    '%.2f' % t_face_l if t_face_l else '-', '%.2f' % t_face_r if t_face_r else '-',
    '%.2f' % t_above if t_above else '-'))
print('JS| landAdit x/z = %.2f (t=%.2f, timber face t=%.2f, %.2f proud of plane %.1f)' % (
    px, t_prop, t_prop + 0.63 * 1.25, t_prop + 0.63 * 1.25 - T_FACE, T_FACE))
