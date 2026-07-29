# Normalize the Landing Site creature + NPC batch, ready for rig_creatures.py.
#
# The rig pipeline requires the mesh normalized FIRST: grounded z=0, centred in
# XY, facing -y (= game +z), final native scale. Skinning after decimation is
# mandatory — decimating a skinned mesh destroys its vertex groups.
#
# Native heights follow the engine's conventions: regular creatures 0.5-0.7
# (Enemy.js applies x1.4 at cfg.scale 1.0), bosses ~0.8 (a 1.8-tall export comes
# out 2.7x the player and buries the threat indicator inside its head), NPCs at
# true world height (the player is 1.78) since _addNpc places them at scale 1.0.
#
# Orientation was verified per asset with a camera framed by
# to_track_quat('-Z','Y') — all six imported upright and facing -y already, so
# nothing is rotated here.
import bpy, json
from mathutils import Matrix

assert bpy.data.filepath.endswith('LandingSite.blend'), bpy.data.filepath

# name -> (target height, decimate target tris)
TARGETS = {
    'Creature_Mossback':  (0.58, 2400),
    'Creature_Burrfang':  (0.52, 2400),
    'Creature_Stiltbeak': (0.70, 2400),
    'Boss_ScrapTyrant':   (0.80, 4000),
    'Npc_Mara':           (1.62, 3000),
    'Npc_Finch':          (1.68, 3000),
}


def strip_pbr(obj):
    for slot in obj.material_slots:
        m = slot.material
        if not m or not m.use_nodes:
            continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf:
            continue
        for sock in ('Metallic', 'Roughness', 'Normal', 'Specular IOR Level'):
            inp = bsdf.inputs.get(sock)
            if inp and inp.is_linked:
                for link in list(inp.links):
                    nt.links.remove(link)
        if bsdf.inputs.get('Metallic'):
            bsdf.inputs['Metallic'].default_value = 0.0
        if bsdf.inputs.get('Roughness'):
            bsdf.inputs['Roughness'].default_value = 1.0
        for n in list(nt.nodes):
            if n.type == 'TEX_IMAGE' and n.image and 'diffuse' not in n.image.name:
                if not any(o.is_linked for o in n.outputs):
                    nt.nodes.remove(n)


def mean_brightness(obj):
    """Rodin sometimes returns near-black bodies; one of those reads as an unlit
    blob in-game. Report the diffuse's mean linear luminance so a too-dark body
    gets gamma-lifted before it ships rather than discovered in the browser."""
    for slot in obj.material_slots:
        m = slot.material
        if not m or not m.use_nodes:
            continue
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image and 'diffuse' in n.image.name:
                px = n.image.pixels[:]
                if not px:
                    return None
                step = max(4, (len(px) // 4 // 4000) * 4)
                tot, cnt = 0.0, 0
                for i in range(0, len(px) - 3, step):
                    tot += 0.2126 * px[i] + 0.7152 * px[i+1] + 0.0722 * px[i+2]
                    cnt += 1
                return round(tot / max(cnt, 1), 4)
    return None


def decimate(obj, target):
    obj.data.calc_loop_triangles()
    cur = len(obj.data.loop_triangles)
    if cur <= target:
        return cur, cur
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('Dec', 'DECIMATE')
    mod.ratio = max(0.02, target / cur)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.calc_loop_triangles()
    return cur, len(obj.data.loop_triangles)


report = []
for name, (target_h, tris) in TARGETS.items():
    o = bpy.data.objects.get(name)
    if not o:
        report.append({'name': name, 'error': 'missing'})
        continue
    if o.get('pp_creature_norm'):
        report.append({'name': name, 'skipped': 1})
        continue

    strip_pbr(o)
    before, after = decimate(o, tris)

    # Scale about the mesh data so the rig (built later at the same origin) and
    # the mesh share one coordinate frame.
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    o.rotation_mode = 'XYZ'
    zs = [v.co.z for v in o.data.vertices]
    s = target_h / max(max(zs) - min(zs), 1e-6)
    o.scale = (o.scale[0] * s, o.scale[1] * s, o.scale[2] * s)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    xs = [v.co.x for v in o.data.vertices]
    ys = [v.co.y for v in o.data.vertices]
    zs = [v.co.z for v in o.data.vertices]
    o.data.transform(Matrix.Translation((
        -(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs))))
    o.data.update()
    o.location = (0, 0, 0)

    xs = [v.co.x for v in o.data.vertices]
    ys = [v.co.y for v in o.data.vertices]
    zs = [v.co.z for v in o.data.vertices]
    o['pp_creature_norm'] = 1
    report.append({
        'name': name, 'tris': [before, after],
        'size': [round(max(xs) - min(xs), 3), round(max(ys) - min(ys), 3),
                 round(max(zs) - min(zs), 3)],
        'z0': round(min(zs), 4),
        'diffuse_mean': mean_brightness(o),
    })

bpy.ops.wm.save_mainfile()
print(json.dumps(report, indent=1))
