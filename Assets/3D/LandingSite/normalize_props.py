# Normalize the Landing Site prop batch for export.
#
# Rodin returns ~23k-tri meshes with a diffuse/metallic-roughness/normal trio at
# 512px. The game re-shades every texture-mapped material to MeshToonMaterial
# (cloneModel in Environment.js), which kills specular outright — so the metallic
# and normal maps are pure payload. Unlinking them here is most of the file-size
# win; decimation is the rest.
#
# Orientation was checked per asset, never batch-applied: the numeric flat-base
# footprint test called 7 of 8 (all Z-up already), and Landing_GrassTuft — a
# radiating fan, narrow at both ends — was settled by a render instead, because
# the footprint test scores a spread crown higher than the true base and would
# have flipped it upside down.
import bpy, json

assert bpy.data.filepath.endswith('LandingSite.blend'), bpy.data.filepath

# name -> (mode, target). 'h' = target height (z), 'l' = target length (longest axis)
TARGETS = {
    'Landing_GrassTuft':   ('h', 0.50,  900),
    'Landing_Wildflowers': ('h', 0.42,  900),
    'Landing_Bush':        ('h', 0.95, 1400),
    'Landing_FallenLog':   ('l', 2.40, 1100),
    'Landing_MineAdit':    ('h', 3.60, 3200),
    'Landing_RockOutcrop': ('h', 1.70, 1600),
    'Landing_Tent':        ('h', 1.70, 1600),
    'Landing_Campfire':    ('h', 0.75, 1300),
}


def strip_pbr(obj):
    """Unlink metallic-roughness and normal maps; keep base color only."""
    dropped = []
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
                dropped.append(sock)
        # Flat-ish response under toon shading.
        if bsdf.inputs.get('Metallic'):
            bsdf.inputs['Metallic'].default_value = 0.0
        if bsdf.inputs.get('Roughness'):
            bsdf.inputs['Roughness'].default_value = 0.9
        # Drop now-orphaned texture nodes so the exporter cannot pick them up.
        for n in list(nt.nodes):
            if n.type == 'TEX_IMAGE' and n.image and not any(o.is_linked for o in n.outputs):
                if 'diffuse' not in n.image.name:
                    nt.nodes.remove(n)
    return dropped


def decimate(obj, target_tris):
    obj.data.calc_loop_triangles()
    cur = len(obj.data.loop_triangles)
    if cur <= target_tris:
        return cur, cur
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('Dec', 'DECIMATE')
    mod.ratio = max(0.02, target_tris / cur)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.calc_loop_triangles()
    return cur, len(obj.data.loop_triangles)


def bounds(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    lo = [min(v[i] for v in vs) for i in range(3)]
    hi = [max(v[i] for v in vs) for i in range(3)]
    return lo, hi


def normalize(obj, mode, target):
    """Scale to target size, ground at z=0, centre in XY. Bakes the transform."""
    lo, hi = bounds(obj)
    size = [hi[i] - lo[i] for i in range(3)]
    ref = size[2] if mode == 'h' else max(size)
    if ref < 1e-6:
        return None
    s = target / ref
    obj.scale = (s, s, s)
    bpy.context.view_layer.update()
    lo, hi = bounds(obj)
    # Move the *object* (not vertex data) so any future parenting stays sane.
    obj.location.x -= (lo[0] + hi[0]) / 2
    obj.location.y -= (lo[1] + hi[1]) / 2
    obj.location.z -= lo[2]
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return bounds(obj)


report = []
for name, (mode, target, tris) in TARGETS.items():
    o = bpy.data.objects.get(name)
    if not o:
        report.append({'name': name, 'error': 'missing'})
        continue
    if o.get('pp_normalized'):
        report.append({'name': name, 'skipped': 'already normalized'})
        continue
    dropped = strip_pbr(o)
    before, after = decimate(o, tris)
    lo, hi = normalize(o, mode, target)
    o['pp_normalized'] = 1
    report.append({
        'name': name, 'tris': [before, after], 'dropped': sorted(set(dropped)),
        'dims': [round(hi[i] - lo[i], 3) for i in range(3)],
        'z0': round(lo[2], 4),
    })

bpy.ops.wm.save_mainfile()
print(json.dumps(report, indent=1))
