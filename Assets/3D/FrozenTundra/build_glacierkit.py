# build_glacierkit.py — the Frozen Tundra's terrain kit: the pieces that turn
# the flat white plane into a stepped glacier.
#
#   Tundra_Sastrugi      wind-carved snow dune, small   (replaces the 22
#   Tundra_SastrugiLong  wind-carved snow ridge, long    CylinderGeometry drifts)
#   Tundra_ShelfWall     terrace riser section, 8 wide × 3.0 tall
#   Tundra_RiftWall      crevasse wall section,  8 wide × 4.0 tall
#   Tundra_IceBridge     natural ice span, ~9 long
#
# Walkable counterparts live in js/scene/zones/FrozenTundra/glacier.js — the
# shelf heights (3.0 / 5.5 / 8.0) and rift widths (7 / 5) are mirrored there.
# Change one, change the other.
#
# COLOUR IS THE POINT. The zone measured 55.7% of frame in a single 8-level
# luminance band because ground, drift and fog were all ~0xe0e8f0. This kit
# deliberately spans snow-white (f4f9ff) to deep rift ice (2a5f85) so the
# terrain itself supplies the value range the palette was missing.
#
# Every closed mass carries a baked `*_OutlineHull` (inflated, reversed
# faces, black) so Environment._addProp skips its runtime hull — the knoll
# lesson: the scale-based hull paints authored terrain solid black.
#
# Run headless:  blender -b --python build_glacierkit.py
# Outputs the five GLBs; source GlacierKit.blend (add to watch-assets.mjs).
import bpy, bmesh, math, os, traceback
from mathutils import Vector

OUT_DIR = r'D:\1Under1OverToo\models'
OUT_BLEND = r'D:\1Under1OverToo\Assets\3D\FrozenTundra\GlacierKit.blend'
RENDER = r'C:\Users\Owner\AppData\Local\Temp\claude\D--Resume-Korina\ce393615-b0dc-435b-b9b1-88d43dac307d\scratchpad\glacierkit_check.png'


def lin(hexstr):
    v = [int(hexstr[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in v) + (1.0,)


def mat(name, hexstr, emissive=None, strength=1.4):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = lin(hexstr)
    b.inputs['Roughness'].default_value = 0.85
    if emissive:
        b.inputs['Emission Color'].default_value = lin(emissive)
        b.inputs['Emission Strength'].default_value = strength
    m.use_backface_culling = True
    return m


def obj_from_bm(bm, name, material, parts, recalc=False, smooth=False):
    """Finalise a bmesh into a flat-shaded object linked in the scene.

    `recalc` fixes hand-wound box strips. A quad list written by hand is easy
    to get consistently INWARD-facing, and with use_backface_culling that
    renders as nothing at all — the piece silently vanishes and you see the
    background through it. That is what blacked out the shelf cap and the rift
    lip first time round.
    """
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    # Flat shading is the house look and right for caps, talus and icicles. It
    # is WRONG for the big lofted wall faces: any per-row change in the surface
    # gives every row its own normal, and a tiled wall then reads as a ladder
    # of rungs. Smoothing just those faces blends the rows and leaves only the
    # silhouette and the vertical fluting, which is what should read.
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    parts.append(ob)
    return ob


def bake_hull(objs, name, parts, inflate=0.05):
    """Inflated, reversed-face black shell — the game's `hasBakedHull` opt-out."""
    bm = bmesh.new()
    for o in objs:
        tmp = bmesh.new()
        tmp.from_mesh(o.data)
        for v in tmp.verts:
            v.co = Vector(v.co) + Vector(o.location)
        tmp.normal_update()
        for v in tmp.verts:
            v.co += v.normal * inflate
        me = bpy.data.meshes.new('tmp')
        tmp.to_mesh(me)
        tmp.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return obj_from_bm(bm, name, INK, parts)



def beam(bm, n, ringfn):
    """A continuous lofted beam: ringfn(t) returns 4 corner points, and
    consecutive rings are bridged. Built as ONE tube rather than N separate
    boxes on purpose — a run of abutting boxes leaves a hard seam at every
    join, and tiled along a shelf those seams read as regular rungs (the whole
    glacier looked like scaffolding until this changed)."""
    rings = []
    for i in range(n + 1):
        pts = ringfn(i / n)
        rings.append([bm.verts.new(p) for p in pts])
    for a, b in zip(rings, rings[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(tuple(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bm.normal_update()



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


def surface_mass(pfn, nx, ny, close_bottom=True, base=-0.15):
    """A closed mass from a parametric top surface pfn(u, v) → (x, y, z).

    Parametric rather than a fixed x/y grid so a footprint can TAPER — a dune
    lofted over a rectangular grid leaves a flat rectangular tray everywhere
    its height field reads zero, which is a worse silhouette than the cylinder
    it replaces.

    The base sits BELOW zero on purpose. A surface that reaches 0 at its own
    perimeter is a zero-thickness volume there, and an inflated outline hull
    over it lands exactly on the body — which speckles the whole prop black
    (the knoll's single-quad step, same failure). Burying the base gives every
    mass real thickness and sinks the prop into the snow besides.
    """
    bm = bmesh.new()
    top = []
    for i in range(nx + 1):
        row = []
        for j in range(ny + 1):
            x, y, z = pfn(i / nx, j / ny)
            row.append(bm.verts.new((x, y, max(0.0, z))))
        top.append(row)
    for i in range(nx):
        for j in range(ny):
            bm.faces.new((top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]))
    if close_bottom:
        bot = [[bm.verts.new((top[i][j].co.x, top[i][j].co.y, base)) for j in range(ny + 1)]
               for i in range(nx + 1)]
        for i in range(nx):
            for j in range(ny):
                bm.faces.new((bot[i][j], bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j]))
        # side skirt around the perimeter
        def wall(a, b):
            for k in range(len(a) - 1):
                if (a[k].co - b[k].co).length < 1e-6 and (a[k + 1].co - b[k + 1].co).length < 1e-6:
                    continue
                try:
                    bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
                except ValueError:
                    pass
        wall(top[0], bot[0])
        wall(bot[-1], top[-1])
        wall([r[0] for r in bot], [r[0] for r in top])
        wall([r[-1] for r in top], [r[-1] for r in bot])
    bm.normal_update()
    return bm


try:
    bpy.ops.wm.read_homefile(use_empty=True)

    # ── Palette ───────────────────────────────────────────────────────────────
    SNOW      = mat('GK_Snow',      'f4f9ff')  # sunlit crest
    SNOW_LEE  = mat('GK_SnowLee',   'c3d4e8')  # shadowed flank — the value anchor
    ICE_FACE  = mat('GK_IceFace',   '7fb3d5')  # exposed shelf ice
    ICE_DEEP  = mat('GK_IceDeep',   '2a5f85')  # rift depths
    ICE_LIP   = mat('GK_IceLip',    'd8f0fa')  # catch-light on every rim
    ICICLE    = mat('GK_Icicle',    'a8d8ec')
    INK       = mat('GK_Ink',       '000000')

    collections = []   # (name, [objects], offset_x)

    # ══ 1-2. SASTRUGI ═════════════════════════════════════════════════════════
    # Wind-carved snow: a sharp crest with a near-vertical WINDWARD scarp and a
    # long LEEWARD taper. The asymmetry is the whole read — it is what a drift
    # actually looks like and what a 10-sided cylinder never could.
    def sastrugi(name, L, W, H, ox, seed):
        import random
        rnd = random.Random(seed)
        wob = [rnd.uniform(-0.16, 0.16) for _ in range(6)]

        def crest(u):                       # the ridge line meanders down its length
            return 0.10 * W * math.sin(u * 5.3 + wob[0]) + 0.06 * W * math.sin(u * 11.0 + wob[1])

        def span(u):                        # peaks forward of centre, tapers to both tips
            s = math.sin(math.pi * (u ** 0.78)) ** 0.9
            return s * (1.0 + 0.13 * math.sin(u * 8.1 + wob[2]))

        def foot(u):                        # half-width envelope — a lens, not a box
            return math.sin(math.pi * u) ** 0.55

        def surf(u, v, hscale=1.0):
            x = -L / 2 + L * u
            fw = (W / 2) * foot(u)          # windward reach
            fl = (W * 0.72) * foot(u)       # leeward reach — the long tail
            y = crest(u) + (-fw + (fw + fl) * v)
            d = (y - crest(u))
            ref = fw if d < 0 else fl
            if ref < 1e-4:
                return (x, y, 0.0)
            t = min(1.0, abs(d) / ref)
            # exponent < 1 → convex, steep-edged scarp; > 1 → long concave tail
            cross = (1 - t) ** (0.45 if d < 0 else 2.2)
            return (x, y, H * span(u) * cross * hscale)

        parts = []
        body = obj_from_bm(surface_mass(surf, 30, 16), name + '_Body', SNOW, parts,
                           smooth=True)
        # No leeward apron. It was a second surface following the body at 0.34
        # height, 0.012 above it — but body and apron both fall to zero at the
        # dune's perimeter, so they converge there and z-fight across the whole
        # rim, which renders as a crosshatch of triangles. Smooth shading now
        # carries the light-to-shadow turn on its own.
        # NO baked hull on the dunes. An inflated shell over a large, soft,
        # low-curvature surface pokes back through the body wherever curvature
        # varies, and renders as a fine triangular hatch across the whole dune
        # — visible triangles, which is precisely what the owner rejected. The
        # placements carry noOutline so the runtime does not add one either;
        # a drift is a ground feature that blends into snow, not a prop that
        # wants an ink silhouette.
        collections.append((name, parts, ox))
        return parts

    sastrugi('Tundra_Sastrugi',     6.0, 2.6, 0.85, 0.0,  4411)
    sastrugi('Tundra_SastrugiLong', 11.5, 3.4, 1.15, 14.0, 9182)

    # ══ 3. SHELF WALL ═════════════════════════════════════════════════════════
    # One 8-unit section of terrace riser, 3.0 tall — the crisp horizontal edge
    # that makes the climb legible at the fixed 46° camera. Stratified ice
    # bands, a snow cap that overhangs the lip, and an icicle fringe.
    def shelf_wall(name, W, H, ox):
        parts = []
        import random
        rnd = random.Random(7731)

        # Face: a slab whose front plane undulates so 8-unit sections tile
        # without reading as a repeat.
        bm = bmesh.new()
        nx, nz = 20, 9
        cols = []
        for i in range(nx + 1):
            x = -W / 2 + W * i / nx
            col = []
            for k in range(nz + 1):
                z = H * k / nz
                # stratification — each band steps out a little further
                band = math.floor(k / nz * 5) / 5
                y = -0.34 - 0.20 * band + 0.07 * math.sin(x * 1.9 + k * 0.7)
                col.append(bm.verts.new((x, y, z)))
            cols.append(col)
        for i in range(nx):
            for k in range(nz):
                bm.faces.new((cols[i][k], cols[i + 1][k], cols[i + 1][k + 1], cols[i][k + 1]))
        # close the back into a solid slab
        back = [[bm.verts.new((cols[i][k].co.x, 0.55, cols[i][k].co.z)) for k in range(nz + 1)]
                for i in range(nx + 1)]
        for i in range(nx):
            for k in range(nz):
                bm.faces.new((back[i][k], back[i][k + 1], back[i + 1][k + 1], back[i + 1][k]))
        for i in range(nx):   # top
            bm.faces.new((cols[i][nz], cols[i + 1][nz], back[i + 1][nz], back[i][nz]))
            bm.faces.new((back[i][0], back[i + 1][0], cols[i + 1][0], cols[i][0]))
        for k in range(nz):   # ends
            bm.faces.new((cols[0][k], cols[0][k + 1], back[0][k + 1], back[0][k]))
            bm.faces.new((back[nx][k], back[nx][k + 1], cols[nx][k + 1], cols[nx][k]))
        bm.normal_update()
        face = obj_from_bm(bm, name + '_Face', ICE_FACE, parts, smooth=True)

        # Snow cap overhanging the lip — the bright horizontal line that reads
        # as an edge from across the zone.
        bmc = bmesh.new()
        def cap_ring(t):
            x = -W / 2 + W * t
            lip = -0.62 - 0.09 * (0.5 + 0.5 * math.sin(x * 2.3 + 0.7))
            th = 0.30 + 0.09 * (0.5 + 0.5 * math.sin(x * 1.7 + 2.1))
            return [(x, lip, H), (x, 0.5, H), (x, 0.5, H + th), (x, lip, H + th)]
        beam(bmc, 30, cap_ring)
        cap = obj_from_bm(bmc, name + '_Cap', SNOW, parts, recalc=True)

        # Icicle fringe under the overhang. Sparse and short: 16 evenly spaced
        # icicles per 8-unit section, tiled along a whole shelf, read as a
        # picket-fence guard rail rather than ice — the regularity is the tell,
        # so they get big gaps and a wide length spread.
        bmi = bmesh.new()
        for i in range(7):
            if rnd.random() < 0.22:
                continue
            x = -W / 2 + W * (i + 0.5) / 7 + rnd.uniform(-0.42, 0.42)
            ln = rnd.uniform(0.16, 0.52)
            r = rnd.uniform(0.045, 0.085)
            top = [bmi.verts.new((x + r * math.cos(a), -0.55 + r * math.sin(a), H))
                   for a in (0, 2.094, 4.189)]
            tip = bmi.verts.new((x, -0.55, H - ln))
            for k in range(3):
                bmi.faces.new((top[k], top[(k + 1) % 3], tip))
            bmi.faces.new(tuple(reversed(top)))
        bmi.normal_update()
        obj_from_bm(bmi, name + '_Icicles', ICICLE, parts, recalc=True)

        # Talus — broken ice piled at the foot, so the wall doesn't meet the
        # snow in a dead straight line.
        bmt = bmesh.new()
        for i in range(11):
            x = -W / 2 + W * (i + 0.5) / 11 + rnd.uniform(-0.3, 0.3)
            s = rnd.uniform(0.16, 0.42)
            rock_into(bmt, x, -0.62 - rnd.uniform(0.0, 0.34), s * 0.45, s, rnd)
        bmt.normal_update()
        obj_from_bm(bmt, name + '_Talus', ICE_LIP, parts)

        bake_hull([face], name + '_OutlineHull', parts, inflate=0.022)
        collections.append((name, parts, ox))

    shelf_wall('Tundra_ShelfWall', 8.0, 3.0, 30.0)

    # ══ 4. RIFT WALL ══════════════════════════════════════════════════════════
    # Crevasse wall: vertical flutes, and a deliberate top-to-bottom value ramp
    # (ICE_FACE lip → ICE_DEEP floor) so looking into the rift reads as DEPTH.
    def rift_wall(name, W, H, ox):
        parts = []
        # FLAT-SHADED, so any per-ROW change in y gives every row its own normal
        # and the wall reads as a ladder of rungs — which is exactly what the
        # first version did (10 rows, a 0.30 undercut ramped over them, and a
        # flute whose depth also varied with height). Flutes are now purely
        # vertical and the undercut is gentle over few rows, so neighbouring
        # rows share a normal and only the vertical fluting survives.
        bm = bmesh.new()
        nx, nz = 26, 4
        cols = []
        for i in range(nx + 1):
            x = -W / 2 + W * i / nx
            col = []
            for k in range(nz + 1):
                z = H * k / nz
                flute = 0.17 * math.sin(x * 3.1) + 0.06 * math.sin(x * 7.7 + 1.1)
                y = -0.25 + flute - 0.10 * (1 - z / H)          # slight undercut at the base
                col.append(bm.verts.new((x, y, z)))
            cols.append(col)
        for i in range(nx):
            for k in range(nz):
                bm.faces.new((cols[i][k], cols[i + 1][k], cols[i + 1][k + 1], cols[i][k + 1]))
        back = [[bm.verts.new((cols[i][k].co.x, 0.6, cols[i][k].co.z)) for k in range(nz + 1)]
                for i in range(nx + 1)]
        for i in range(nx):
            for k in range(nz):
                bm.faces.new((back[i][k], back[i][k + 1], back[i + 1][k + 1], back[i + 1][k]))
            bm.faces.new((cols[i][nz], cols[i + 1][nz], back[i + 1][nz], back[i][nz]))
            bm.faces.new((back[i][0], back[i + 1][0], cols[i + 1][0], cols[i][0]))
        for k in range(nz):
            bm.faces.new((cols[0][k], cols[0][k + 1], back[0][k + 1], back[0][k]))
            bm.faces.new((back[nx][k], back[nx][k + 1], cols[nx][k + 1], cols[nx][k]))
        bm.normal_update()
        deep = obj_from_bm(bm, name + '_Deep', ICE_DEEP, parts, smooth=True)

        # Upper band in the lighter ice, inset so it layers over the deep mass.
        bm2 = bmesh.new()
        cols2 = []
        for i in range(nx + 1):
            x = -W / 2 + W * i / nx
            col = []
            for k in range(3):
                z = H * (0.62 + 0.38 * k / 2)
                flute = 0.17 * math.sin(x * 3.1) + 0.06 * math.sin(x * 7.7 + 1.1)
                col.append(bm2.verts.new((x, -0.28 + flute, z)))
            cols2.append(col)
        for i in range(nx):
            for k in range(2):
                bm2.faces.new((cols2[i][k], cols2[i + 1][k], cols2[i + 1][k + 1], cols2[i][k + 1]))
        bm2.normal_update()
        obj_from_bm(bm2, name + '_Upper', ICE_FACE, parts, smooth=True)

        # Snow lip along the rim
        bml = bmesh.new()
        def lip_ring(t):
            x = -W / 2 + W * t
            f = -0.46 + 0.07 * math.sin(x * 2.9)
            th = 0.26 + 0.07 * (0.5 + 0.5 * math.sin(x * 2.1 + 1.3))
            return [(x, f, H), (x, 0.55, H), (x, 0.55, H + th), (x, f, H + th)]
        beam(bml, 30, lip_ring)
        lip = obj_from_bm(bml, name + '_Lip', SNOW, parts, recalc=True)

        bake_hull([deep], name + '_OutlineHull', parts, inflate=0.022)
        collections.append((name, parts, ox))

    rift_wall('Tundra_RiftWall', 8.0, 4.0, 46.0)

    # ══ 5. ICE BRIDGE ═════════════════════════════════════════════════════════
    # A natural span: thick at the abutments, thinner and slightly sagged
    # mid-crossing, with a snow-dusted deck. Native length 9 for the 7-unit
    # rifts (glacier.js spans overlap each bank by 0.5).
    def ice_bridge(name, L, W, ox):
        parts = []
        bm = bmesh.new()
        nx, ny = 22, 5
        top, bot = [], []
        for i in range(nx + 1):
            u = i / nx
            x = -L / 2 + L * u
            sag = -0.14 * math.sin(math.pi * u)
            thick = 0.34 + 0.55 * (1 - math.sin(math.pi * u) ** 0.7)   # fat at the ends
            wr = W / 2 * (1.0 + 0.30 * (1 - math.sin(math.pi * u)))     # flares at the ends
            rowt, rowb = [], []
            for j in range(ny + 1):
                y = -wr + 2 * wr * j / ny
                edge = 1 - (abs(y) / wr) ** 2.4
                rowt.append(bm.verts.new((x, y, sag + 0.06 * edge)))
                rowb.append(bm.verts.new((x, y, sag - thick * (0.45 + 0.55 * edge))))
            top.append(rowt); bot.append(rowb)
        for i in range(nx):
            for j in range(ny):
                bm.faces.new((top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]))
                bm.faces.new((bot[i][j], bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j]))
            bm.faces.new((top[i][0], bot[i][0], bot[i + 1][0], top[i + 1][0]))
            bm.faces.new((top[i + 1][ny], bot[i + 1][ny], bot[i][ny], top[i][ny]))
        for j in range(ny):     # cap both mouths
            bm.faces.new((top[0][j], top[0][j + 1], bot[0][j + 1], bot[0][j]))
            bm.faces.new((bot[nx][j], bot[nx][j + 1], top[nx][j + 1], top[nx][j]))
        bm.normal_update()
        body = obj_from_bm(bm, name + '_Body', ICE_FACE, parts)

        # Snow deck — a walked strip down the middle, slightly proud of the ice.
        bmd = bmesh.new()
        dtop = []
        for i in range(nx + 1):
            u = i / nx
            x = -L / 2 + L * u
            sag = -0.14 * math.sin(math.pi * u)
            row = []
            for j in range(4):
                y = -W * 0.34 + W * 0.68 * j / 3
                row.append(bmd.verts.new((x, y, sag + 0.10)))
            dtop.append(row)
        for i in range(nx):
            for j in range(3):
                bmd.faces.new((dtop[i][j], dtop[i + 1][j], dtop[i + 1][j + 1], dtop[i][j + 1]))
        bmd.normal_update()
        obj_from_bm(bmd, name + '_Deck', SNOW, parts)

        bake_hull([body], name + '_OutlineHull', parts, inflate=0.045)
        collections.append((name, parts, ox))

    ice_bridge('Tundra_IceBridge', 9.0, 3.0, 62.0)

    # ── Collections + export ─────────────────────────────────────────────────
    for name, parts, ox in collections:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
        coll['export_offset'] = [ox, 0.0, 0.0]
        for o in parts:
            o.location.x += ox
            for c in list(o.users_collection):
                c.objects.unlink(o)
            coll.objects.link(o)

    sizes = []
    for name, parts, ox in collections:
        bpy.ops.object.select_all(action='DESELECT')
        for o in parts:
            o.location.x -= ox
            o.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        path = os.path.join(OUT_DIR, name + '.glb')
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True)
        for o in parts:
            o.location.x += ox
        sizes.append('%s %.0fKB' % (name, os.path.getsize(path) / 1024))

    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)

    # ── Check render ─────────────────────────────────────────────────────────
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            bpy.context.scene.render.engine = eng
            break
        except Exception:
            pass
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3.4
    sun.rotation_euler = (0.85, 0.1, 0.75)
    bpy.context.scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    cam.data.type = 'ORTHO'
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    # EEVEE draws the reversed-face hulls regardless of use_backface_culling,
    # which blacks out every mass in the check render. three.js culls them
    # correctly (glTF doubleSided:false → FrontSide + reversed winding = the
    # standard inverted-hull outline, exactly as hull_pines.py's shells behave
    # in game). Hide them here so the render shows the actual geometry.
    for o in bpy.context.scene.objects:
        if o.name.endswith('_OutlineHull'):
            o.hide_render = True
    # Two passes at the game's own 46° elevation: the dunes (whose asymmetry is
    # the thing worth eyeballing) close up, then the whole kit.
    for tag, cx, scale, res in (('dunes', 10.0, 30.0, (1200, 620)),
                                ('all', 34.0, 76.0, (1520, 560))):
        cam.data.ortho_scale = scale
        target = Vector((cx, 0, 1.2))
        cam.location = target + Vector((0.35, -0.62, 0.70)) * (scale * 1.2)
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = res
        bpy.context.scene.render.filepath = RENDER.replace('.png', '_%s.png' % tag)
        bpy.ops.render.render(write_still=True)

    report = []
    for name, parts, ox in collections:
        vs = [(v.co.x + o.location.x - ox, v.co.y + o.location.y, v.co.z + o.location.z)
              for o in parts for v in o.data.vertices]
        mn = [min(p[i] for p in vs) for i in range(3)]
        mx = [max(p[i] for p in vs) for i in range(3)]
        report.append('%s x[%.2f,%.2f] y[%.2f,%.2f] z[%.2f,%.2f]'
                      % (name, mn[0], mx[0], mn[1], mx[1], mn[2], mx[2]))
    print('GLACIERKIT_OK ' + ' | '.join(sizes))
    for r in report:
        print('  ' + r)
except Exception:
    print('GLACIERKIT_FAIL: ' + traceback.format_exc()[-2000:])
