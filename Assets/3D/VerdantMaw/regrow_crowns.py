# regrow_crowns.py — replace the hand-built (bmesh) crown foliage on the three
# ramp trees with Rodin canopy-mass geometry.
#
#   blender -b --factory-startup --python Assets/3D/VerdantMaw/regrow_crowns.py
#
# WHY. The Hometree, the Great Tree and the Root Spires are the only trees in
# the Verdant Maw whose canopies are still authored procedurally, and they stand
# next to Rodin sculpts. The owner spotted it immediately from a play session:
# "the immediate use of triangles for foliage, unlike the other rodin models."
# The numbers agree — Hometree_Crown is 560 tris spread over 13.6 units (~4 tris
# per square unit, countable facets) while the Rodin spire trunk beside it is
# 14,999 tris over 1.6 x 4.0.
#
# HOW. Each old crown is REPLACED IN PLACE by a cluster of decimated
# Jungle_CanopyMass instances — the same Rodin sculpt the zone already instances
# ~40x, so the ramp trees now read as part of that family instead of as
# leftovers. Instance centres are sampled from the OLD crown's own vertices
# (greedy min-distance), which is the load-bearing trick here: the replacement
# inherits the original silhouette, height distribution and — critically — its
# holes. The Hometree's south sector is deliberately pruned open so the crown
# does not hang over the ramp approach (the owner had the entrance buried twice
# and it was cleared parametrically off TH0); scattering uniformly would grow it
# straight back. Sampling the old mesh cannot re-fill a sector that has no
# vertices in it.
#
# WHAT IS NOT TOUCHED. Nothing walkable. RootSpire_Crown is the crown platform
# DECK — its top face is the walk surface at z 7.00 that canopy.js SPIRE mirrors
# and tests/systems/walkableSurfaces.test.js walks at 5 cm steps — so only the
# Tufts (the foliage sitting on it) are regrown. Likewise the Hometree's Ramp,
# Junction and entrance apron are left exactly as they are.
#
# Materials: the main crowns take the Rodin canopy material as-is (that IS the
# "like the other rodin models" the owner asked for). The small violet accent
# puffs keep each tree's own accent material so the Hometree and Great Tree do
# not lose their identity. Base Color is left UNLINKED on those flat materials —
# a linked Base Color exports baseColorFactor as white (CLAUDE.md gotcha).
#
# Run Assets/3D/export_blend.py on each .blend afterwards to emit the GLBs.

import bpy, bmesh, math, os, random, mathutils

BASE = r'D:\1Under1OverToo'
SRC = os.path.join(BASE, 'Assets', '3D', 'VerdantMaw')
DONOR_GLB = os.path.join(BASE, 'models', 'Jungle_CanopyMass.glb')

# blend -> [(crown object, instances, scale range, accent material or None, z floor)]
# `accent=None` keeps the Rodin canopy material. `z floor=None` lets the crown
# sag 0.2 below where it grew; set it where something walkable is underneath.
JOBS = {
    'Canopy.blend': [
        ('Hometree_Crown',       9, (0.95, 1.45), None, None),
        ('Hometree_CrownAccent', 3, (0.55, 0.80), 'CanopyLeafViolet', None),
    ],
    'GreatTree.blend': [
        ('GreatTree_Crown',       5, (0.70, 1.05), None, None),
        ('GreatTree_CrownAccent', 2, (0.45, 0.65), 'GreatTreeLeafViolet', None),
    ],
    # The crown DECK is omitted on purpose — it is the walkable platform at
    # z 7.00 that canopy.js SPIRE mirrors. Only the tufts sitting on it are
    # regrown, and they are floored at 6.82 (where the old tufts nestled) so no
    # foliage ever intrudes into the surface the player walks on.
    'RootSpire.blend': [
        ('RootSpire_Tufts', 4, (0.50, 0.75), None, 6.82),
    ],
}

# Decimate the donor before instancing. 9k tris x 9 instances would put 81k
# triangles into one crown; the spire alone places 4x in the zone. ~0.33 keeps
# roughly 3k per instance — still ~5x the density of the sculpt it sits beside,
# and ~50x the old crown.
DONOR_RATIO = 0.33


def log(msg):
    print('REGROW| ' + msg)


def load_donor():
    """Import Jungle_CanopyMass, decimate it, return (mesh datablock, material,
    radius). The imported object itself is removed so it never exports."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=DONOR_GLB)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    if not meshes:
        raise RuntimeError('donor GLB imported no meshes')

    # Join to one object if the GLB arrived in parts.
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    donor = bpy.context.view_layer.objects.active

    mod = donor.modifiers.new('dec', 'DECIMATE')
    mod.ratio = DONOR_RATIO
    bpy.ops.object.modifier_apply(modifier=mod.name)

    # Centre the mesh on its own bounds so instancing places predictably, and
    # measure the radius so cluster scales can be reasoned about in world units.
    me = donor.data
    lo = mathutils.Vector((1e9, 1e9, 1e9))
    hi = mathutils.Vector((-1e9, -1e9, -1e9))
    for v in me.vertices:
        for i in range(3):
            lo[i] = min(lo[i], v.co[i]); hi[i] = max(hi[i], v.co[i])
    mid = (lo + hi) * 0.5
    for v in me.vertices:
        v.co -= mid
    radius = max((hi - lo).x, (hi - lo).y) * 0.5

    mat = donor.data.materials[0] if donor.data.materials else None
    me.calc_loop_triangles()
    log('donor Jungle_CanopyMass -> %d tris, radius %.2f' % (len(me.loop_triangles), radius))

    keep_mesh = me.copy()
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    return keep_mesh, mat, radius


def sample_centres(obj, count, seed):
    """Greedy farthest-point sample of the old crown's vertices, in world space.

    Using the original geometry as the seed set is what preserves the pruned
    sectors and the overall crown shape — a sector with no vertices contributes
    no instance, so holes stay holes.
    """
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    if not pts:
        return []
    rnd = random.Random(seed)
    chosen = [pts[rnd.randrange(len(pts))]]
    while len(chosen) < count and len(chosen) < len(pts):
        best, bestd = None, -1.0
        for p in pts:
            d = min((p - c).length for c in chosen)
            if d > bestd:
                bestd, best = d, p
        chosen.append(best)
    return chosen


SECTORS = 32
ENVELOPE_TOL = 1.05   # allow the new crown 5% past the old outline, no more


def sector_profile(points, ax, ay):
    """Max radius per angular sector around (ax, ay) — the crown's outline.

    Circularly smoothed so the clamp that uses it deforms smoothly instead of
    carving 32 flat facets (which would just trade one faceted crown for
    another). Empty sectors inherit their neighbours so a sparse sector can
    never collapse geometry onto the axis.
    """
    prof = [0.0] * SECTORS
    for p in points:
        r = math.hypot(p.x - ax, p.y - ay)
        i = int(((math.atan2(p.y - ay, p.x - ax) + math.pi) / (2 * math.pi)) * SECTORS) % SECTORS
        prof[i] = max(prof[i], r)
    known = [i for i, v in enumerate(prof) if v > 0]
    if not known:
        return None
    for i in range(SECTORS):
        if prof[i] <= 0:
            prof[i] = min(prof[j] for j in known)
    sm = [0.0] * SECTORS
    for i in range(SECTORS):
        sm[i] = (prof[(i - 1) % SECTORS] + 2 * prof[i] + prof[(i + 1) % SECTORS]) / 4
    return sm


def clamp_to_envelope(ob, prof, ax, ay, zlo, zhi):
    """Pull any vertex outside the old crown's envelope back onto it.

    This is what keeps the replacement honest. Instance centres are sampled from
    the old crown's vertices, but each instance is a ~3.2-unit ball, so the ones
    ringing a hole bulge into it — measured on the first pass, the Hometree's
    pruned entrance sector went from r 2.5-3.2 back out to 6.4-8.5, hanging the
    canopy over the ramp approach again. Deforming (rather than deleting) keeps
    the shells closed, so no cut edges expose black interiors.
    """
    me = ob.data
    for v in me.vertices:
        r = math.hypot(v.co.x - ax, v.co.y - ay)
        if r > 1e-5:
            a = math.atan2(v.co.y - ay, v.co.x - ax)
            fi = ((a + math.pi) / (2 * math.pi)) * SECTORS
            i0 = int(fi) % SECTORS
            i1 = (i0 + 1) % SECTORS
            f = fi - int(fi)
            lim = (prof[i0] * (1 - f) + prof[i1] * f) * ENVELOPE_TOL
            if r > lim:
                k = lim / r
                v.co.x = ax + (v.co.x - ax) * k
                v.co.y = ay + (v.co.y - ay) * k
        v.co.z = min(max(v.co.z, zlo), zhi)


def regrow(obj, donor_mesh, donor_mat, donor_r, count, scale_range, accent_name, seed,
           z_floor=None):
    """Replace `obj` with a joined cluster of donor instances covering its bounds."""
    name = obj.name
    colls = list(obj.users_collection)

    # Capture the outline BEFORE the original is destroyed — it is the contract
    # the replacement has to honour.
    old_world = [obj.matrix_world @ v.co for v in obj.data.vertices]
    ozlo = min(p.z for p in old_world)
    ozhi = max(p.z for p in old_world)
    axis_x = (min(p.x for p in old_world) + max(p.x for p in old_world)) * 0.5
    axis_y = (min(p.y for p in old_world) + max(p.y for p in old_world)) * 0.5
    prof = sector_profile(old_world, axis_x, axis_y)
    # Foliage may sag a little below where it grew and puff a little above, but
    # a hard floor is available for crowns sitting on a walkable deck.
    zlo = ozlo - 0.20 if z_floor is None else z_floor
    zhi = ozhi + 0.35
    accent_mat = bpy.data.materials.get(accent_name) if accent_name else None
    if accent_name and not accent_mat:
        log('WARN: accent material %r not found, using donor material' % accent_name)

    centres = sample_centres(obj, count, seed)
    if not centres:
        log('WARN: %s has no vertices, skipped' % name)
        return None

    rnd = random.Random(seed ^ 0x5f3a)
    parts = []
    for i, c in enumerate(centres):
        me = donor_mesh.copy()
        inst = bpy.data.objects.new('%s_part%d' % (name, i), me)
        bpy.context.scene.collection.objects.link(inst)
        s = rnd.uniform(*scale_range)
        inst.scale = (s, s * rnd.uniform(0.9, 1.1), s * rnd.uniform(0.75, 1.0))
        inst.rotation_euler = (rnd.uniform(-0.12, 0.12), rnd.uniform(-0.12, 0.12),
                               rnd.uniform(0, 2 * math.pi))
        inst.location = c
        parts.append(inst)

    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    merged = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Weld the overlapping instance shells so the cluster reads as one canopy
    # rather than a pile of separate blobs poking through each other.
    bm = bmesh.new()
    bm.from_mesh(merged.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.02)
    bm.to_mesh(merged.data)
    bm.free()

    if prof:
        clamp_to_envelope(merged, prof, axis_x, axis_y, zlo, zhi)

    merged.data.materials.clear()
    merged.data.materials.append(accent_mat if accent_mat else donor_mat)

    # Take over the old crown's identity: same name, same collection(s), so the
    # export contract and anything keyed on mesh names is unchanged.
    old_tris = len(obj.data.loop_triangles)
    bpy.data.objects.remove(obj, do_unlink=True)
    merged.name = name
    merged.data.name = name
    for c in merged.users_collection:
        c.objects.unlink(merged)
    for c in colls:
        c.objects.link(merged)

    merged.data.calc_loop_triangles()
    log('%s: %d tris -> %d tris (%d instances)'
        % (name, old_tris, len(merged.data.loop_triangles), len(centres)))
    return merged


def main():
    for blend, jobs in JOBS.items():
        path = os.path.join(SRC, blend)
        if not os.path.exists(path):
            log('SKIP %s (missing)' % blend)
            continue
        bpy.ops.wm.open_mainfile(filepath=path)
        for o in bpy.data.objects:
            if o.type == 'MESH':
                o.data.calc_loop_triangles()
        donor_mesh, donor_mat, donor_r = load_donor()

        for seed, (obj_name, count, srange, accent, zfloor) in enumerate(jobs):
            obj = bpy.data.objects.get(obj_name)
            if not obj:
                log('WARN: %s not found in %s' % (obj_name, blend))
                continue
            regrow(obj, donor_mesh, donor_mat, donor_r, count, srange, accent,
                   seed=7717 + seed * 131, z_floor=zfloor)

        bpy.data.meshes.remove(donor_mesh, do_unlink=True)
        bpy.ops.wm.save_as_mainfile(filepath=path)
        log('saved %s' % blend)


main()
