# build_pads.py (v3 — layered soft-flatten) — canopy pad processing.
#
# v2 history: the graft-a-flat-disc construction read as "perfect circle with
# a UI ring", so v2 kept each Rodin pad as ONE sculpture and flattened the
# walk cylinder in place. But v2 crushed EVERYTHING in that cylinder to deck
# height: blossom petals spanning the walk zone folded flat (sheared faces →
# white streaks radiating off the rim) and multi-layer geometry became exactly
# coplanar sheets (z-fight shudder as the camera pans — the owner's red
# circles, all variant-B pads). v3 flattens only what the feet need:
#   * full flatten inside a vertical BAND around deck (fills dips, levels the
#     floor); tall features above deck+0.75 KEEP their shape — the blossom
#     petal ring survives, and the reveal cut opens it around the player
#   * feather 0.35..0.75 above deck so petal skirts blend, never shear
#   * of coincident flattened layers in one XY cell, only the top layer lands
#     on deck; lower original-z layers tuck 0.15/layer below the floor
#   * flattened verts get ±1.2 cm seeded jitter — no two independent sheets
#     are ever exactly coplanar, so there is nothing left to strobe
#   * baked custom split normals are cleared so the leveled floor shades from
#     its real geometry (v2 kept stale baked normals under the deck)
#
# Expects Rodin imports 'RodinPad2A' + 'RodinPad2B' in the scene (re-import
# via task uuids in the scratchpad ledger if starting clean).
# Outputs Pandora_CanopyPad(.2).glb; source saved as PandoraPads.blend (watched).
import bpy, math, os, random, traceback

OUT_DIR = r'D:\1Under1OverToo\models'

def apply_all(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def strip_mats(ob, tag):
    for slot in ob.material_slots:
        m = slot.material
        if not m or not m.use_nodes: continue
        b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if b:
            b.inputs['Roughness'].default_value = 1.0
            b.inputs['Metallic'].default_value = 0.0
        for n in list(m.node_tree.nodes):
            if n.type == 'TEX_IMAGE' and n.image and 'diffuse' not in n.image.name: m.node_tree.nodes.remove(n)
            elif n.type == 'NORMAL_MAP': m.node_tree.nodes.remove(n)
        m.name = tag
    ob.rotation_mode = 'XYZ'

def into_collection(ob, cname, off):
    coll = bpy.data.collections.get(cname) or bpy.data.collections.new(cname)
    if cname not in [c.name for c in bpy.context.scene.collection.children]:
        bpy.context.scene.collection.children.link(coll)
    for c in list(ob.users_collection): c.objects.unlink(ob)
    coll.objects.link(ob)
    coll['export_offset'] = [off, 0, 0]
    return coll

def export_coll(cname, off):
    # Objects are AT ORIGIN when this runs — export first (bakes clean node
    # transforms), THEN park at the source-file offset. The first version
    # subtracted the offset before ever adding it and baked -off into every
    # GLB node (pads/curtains rendered 12 units west of their placements).
    coll = bpy.data.collections[cname]
    objs = list(coll.all_objects)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    path = os.path.join(OUT_DIR, cname + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True)
    for o in objs:
        if o.parent is None: o.location.x += off
    return round(os.path.getsize(path) / 1024, 1)

def soft_flatten(me, deck):
    flat = {}  # vert index -> original z, for fully-flattened verts
    for v in me.vertices:
        r = math.hypot(v.co.x, v.co.y)
        if r >= 4.3: continue
        d = v.co.z - deck
        if d < -0.6 or d > 0.75: continue        # outside the band: keep shape
        w = 1.0 if r <= 3.4 else (4.3 - r) / 0.9  # radial feather (as v2)
        if d > 0.35: w *= (0.75 - d) / 0.4        # petal-skirt feather
        if w <= 0.0: continue
        if w > 0.98: flat[v.index] = v.co.z
        v.co.z = v.co.z * (1 - w) + deck * w
    # Layer tuck: bucket fully-flattened verts by XY cell; the top original-z
    # layer owns the floor, anything that was a distinct surface below it
    # (fold-overs, under-petals crushed upward) drops beneath the deck.
    cells = {}
    for vi, oz in flat.items():
        v = me.vertices[vi]
        cells.setdefault((int(v.co.x / 0.25), int(v.co.y / 0.25)), []).append((oz, vi))
    tucked = 0
    for entries in cells.values():
        entries.sort(reverse=True)
        layer, prev = 0, None
        for oz, vi in entries:
            if prev is not None and prev - oz > 0.3: layer += 1
            prev = oz
            if layer:
                me.vertices[vi].co.z -= 0.15 * layer
                tucked += 1
    # Micro-jitter: whatever coplanarity survives (same-layer overlaps) gets
    # broken by ±1.2 cm per-vertex noise — a stable depth winner, no strobe.
    rnd = random.Random(20260726)
    for vi in flat:
        me.vertices[vi].co.z += (rnd.random() - 0.5) * 0.024
    return len(flat), tucked

def process_pad(name, outName, depth_target, off):
    ob = bpy.data.objects[name]
    strip_mats(ob, outName + 'Skin')
    apply_all(ob)
    vs = [v.co for v in ob.data.vertices]
    dx = max(v.x for v in vs) - min(v.x for v in vs)
    dy = max(v.y for v in vs) - min(v.y for v in vs)
    dz = max(v.z for v in vs) - min(v.z for v in vs)
    sxy = 8.6 / max(dx, dy)
    ob.scale = (sxy, sxy, depth_target / dz)
    bpy.ops.object.transform_apply(scale=True)
    # Center XY
    vs = [v.co for v in ob.data.vertices]
    cx = (max(v.x for v in vs) + min(v.x for v in vs)) / 2
    cy = (max(v.y for v in vs) + min(v.y for v in vs)) / 2
    ob.location = (-cx, -cy, 0)
    bpy.ops.object.transform_apply(location=True)
    # Deck = p60 z of near-center top-band verts (same derivation as v2, so
    # game-side scale/parking stay identical)
    me = ob.data
    zs = [v.co.z for v in me.vertices]
    zmax = max(zs); H = zmax - min(zs)
    band_floor = zmax - 0.30 * H
    topband = sorted(v.co.z for v in me.vertices
                     if math.hypot(v.co.x, v.co.y) < 3.0 and v.co.z > band_floor)
    deck = topband[int(len(topband) * 0.60)] if topband else 0.0
    nflat, ntuck = soft_flatten(me, deck)
    # Stale baked normals under the leveled floor shade wrong — recompute
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    try: bpy.ops.mesh.customdata_custom_splitnormals_clear()
    except Exception: pass
    # Park the deck at z -0.04 (walk line is z 0 at game scale p.r/4.0)
    ob.location.z = -deck - 0.04
    bpy.ops.object.transform_apply(location=True)
    ob.name = outName + '_Body'
    into_collection(ob, outName, off)
    kb = export_coll(outName, off)
    return {'kb': kb, 'flat': nflat, 'tucked': ntuck}

try:
    results = {}
    results['Pandora_CanopyPad'] = process_pad('RodinPad2A', 'Pandora_CanopyPad', 9.0, 0)
    results['Pandora_CanopyPad2'] = process_pad('RodinPad2B', 'Pandora_CanopyPad2', 8.6, 12)
    for o in list(bpy.data.objects):
        if o.type in ('LIGHT', 'CAMERA'): bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.wm.save_as_mainfile(filepath=r'D:\1Under1OverToo\Assets\3D\VerdantMaw\PandoraPads.blend')
    print('PADS_OK ' + str(results))
    result = results
except Exception:
    result = 'FAIL: ' + traceback.format_exc()[-1600:]
    print(result)
