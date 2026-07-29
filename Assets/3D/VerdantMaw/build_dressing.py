# build_dressing.py — canopy corridor enclosure props (owner quality round).
# Expects Rodin imports 'RodinFoliage' + 'RodinVines' in the scene.
# Outputs Pandora_CanopyFoliage.glb (billowing leaf cloud with glow flowers)
# and Pandora_VineCurtain.glb (hanging vine curtain, glow tips); source saved
# as PandoraDressing.blend (watched). These give the treetop layer MASS —
# the loop reads as travel through a canopy forest, not pads in a void.
import bpy, math, os, traceback

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

def process(name, outName, height_target, off, pre_rot=None):
    ob = bpy.data.objects[name]
    strip_mats(ob, outName + 'Skin')
    if pre_rot:
        ob.rotation_euler = pre_rot
    apply_all(ob)
    vs = [v.co for v in ob.data.vertices]
    dz = max(v.z for v in vs) - min(v.z for v in vs)
    s = height_target / dz
    ob.scale = (s, s, s)
    bpy.ops.object.transform_apply(scale=True)
    vs = [v.co for v in ob.data.vertices]
    cx = (max(v.x for v in vs) + min(v.x for v in vs)) / 2
    cy = (max(v.y for v in vs) + min(v.y for v in vs)) / 2
    minz = min(v.z for v in vs)
    ob.location = (-cx, -cy, -minz)
    bpy.ops.object.transform_apply(location=True)
    ob.name = outName + '_Body'
    coll = bpy.data.collections.get(outName) or bpy.data.collections.new(outName)
    if outName not in [c.name for c in bpy.context.scene.collection.children]:
        bpy.context.scene.collection.children.link(coll)
    for c in list(ob.users_collection): c.objects.unlink(ob)
    coll.objects.link(ob)
    coll['export_offset'] = [off, 0, 0]
    # Export AT ORIGIN first, then park at the source offset (see the
    # export_coll note in build_pads.py — the reversed order baked -off
    # into the GLB nodes).
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    path = os.path.join(OUT_DIR, outName + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True)
    ob.location.x += off
    return round(os.path.getsize(path) / 1024, 1)

try:
    results = {}
    results['Pandora_CanopyFoliage'] = process('RodinFoliage', 'Pandora_CanopyFoliage', 3.6, 0)
    # Vines import lying (hang along +Y): -90° about X maps +Y -> -Z so the
    # vines hang DOWN (+90° stood them on their head — they rendered as
    # upward petal bursts in-game).
    results['Pandora_VineCurtain'] = process('RodinVines', 'Pandora_VineCurtain', 4.6, 12,
                                             pre_rot=(-math.pi / 2, 0, 0))
    for o in list(bpy.data.objects):
        if o.type in ('LIGHT', 'CAMERA'): bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.wm.save_as_mainfile(filepath=r'D:\1Under1OverToo\Assets\3D\VerdantMaw\PandoraDressing.blend')
    print('DRESSING_OK ' + str(results))
    result = results
except Exception:
    result = 'FAIL: ' + traceback.format_exc()[-1600:]
    print(result)
