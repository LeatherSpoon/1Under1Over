# rodin_process.py — shared processing pipeline for raw Rodin sculpts
# (imported by build_lanterntree.py / build_canopymass.py / build_spire.py).
#
# Steps (the Mine-pack texture recipe + the orientation slab test):
#   import raw GLB → join parts → collapse to ONE diffuse-only material with
#   the basecolor scaled to 512px (gamma-lift if near-black) → orient upright
#   by the six-axis slab test (flat base = highest outer-slab cross-section)
#   → center/ground/scale to target height → optional decimate.
#
# Everything returns the single joined object for the caller to build on.
import bpy, bmesh, math


def import_raw(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in set(bpy.data.objects) - before if o.type == 'MESH']


def join_parts(meshes):
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


def find_diffuse(ob):
    for slot in ob.material_slots:
        m = slot.material
        if not (m and m.use_nodes): continue
        bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf: continue
        link = next((l for l in m.node_tree.links if l.to_node == bsdf
                     and l.to_socket.name == 'Base Color'), None)
        if link and link.from_node.type == 'TEX_IMAGE':
            return link.from_node.image
    return None


def collapse_material(ob, name, img, lift_if_dark=True):
    """One diffuse-only material; 512px texture; gamma-lift near-black bakes."""
    if img and (img.size[0] > 512 or img.size[1] > 512):
        img.scale(512, 512)
    if img and lift_if_dark:
        px = list(img.pixels)
        rgb = [px[i] for i in range(len(px)) if i % 4 != 3]
        mean = sum(rgb) / max(1, len(rgb))
        if mean < 0.16:
            g = 0.54
            for i in range(len(px)):
                if i % 4 != 3: px[i] = px[i] ** g
            img.pixels[:] = px
            print('  gamma-lifted diffuse: mean %.3f -> brighter' % mean)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = 1.0
    if img:
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = img
        mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    for p in ob.data.polygons: p.material_index = 0
    return mat


def orient_upright(ob):
    """Six-axis slab test: the flat base has the largest outer-10% slab
    cross-section; up = the opposite direction. Rotates so up → +Z."""
    vs = [v.co.copy() for v in ob.data.vertices]
    best, best_area = None, -1
    for axis in range(3):
        lo = min(v[axis] for v in vs); hi = max(v[axis] for v in vs)
        span = hi - lo or 1
        for sign in (-1, 1):
            if sign < 0:
                slab = [v for v in vs if v[axis] < lo + 0.1 * span]
            else:
                slab = [v for v in vs if v[axis] > hi - 0.1 * span]
            if len(slab) < 8: continue
            oa, obx = (axis + 1) % 3, (axis + 2) % 3
            area = ((max(v[oa] for v in slab) - min(v[oa] for v in slab)) *
                    (max(v[obx] for v in slab) - min(v[obx] for v in slab)))
            if area > best_area:
                best_area, best = area, (axis, sign)
    axis, sign = best
    up = (axis, -sign)  # base direction found; up is the opposite
    import mathutils
    rots = {
        (2, 1): None,
        (2, -1): mathutils.Matrix.Rotation(math.pi, 4, 'X'),
        (0, 1): mathutils.Matrix.Rotation(-math.pi / 2, 4, 'Y'),
        (0, -1): mathutils.Matrix.Rotation(math.pi / 2, 4, 'Y'),
        (1, 1): mathutils.Matrix.Rotation(math.pi / 2, 4, 'X'),
        (1, -1): mathutils.Matrix.Rotation(-math.pi / 2, 4, 'X'),
    }
    m = rots[up]
    if m is not None:
        ob.data.transform(m)
    print('  orient: base axis %s sign %+d -> rotated %s' % ('XYZ'[axis], sign, 'no' if m is None else 'yes'))


def normalize(ob, height):
    """Center XY on bbox center, ground min-Z to 0, uniform scale to height."""
    vs = ob.data.vertices
    mn = [min(v.co[i] for v in vs) for i in range(3)]
    mx = [max(v.co[i] for v in vs) for i in range(3)]
    cx, cy = (mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2
    s = height / (mx[2] - mn[2])
    for v in vs:
        v.co.x = (v.co.x - cx) * s
        v.co.y = (v.co.y - cy) * s
        v.co.z = (v.co.z - mn[2]) * s
    return s


def decimate(ob, target_tris):
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if tris <= target_tris: return tris
    mod = ob.modifiers.new('dec', 'DECIMATE')
    mod.ratio = target_tris / tris
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier='dec')
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def export_collection(name, objects, out_glb, out_blend):
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    coll['export_offset'] = [0, 0, 0]
    for ob in objects:
        for c in list(ob.users_collection): c.objects.unlink(ob)
        coll.objects.link(ob)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=True)
    bpy.ops.wm.save_as_mainfile(filepath=out_blend)


def check_render(objects, out_png, look_z, dist=1.6):
    import mathutils
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            bpy.context.scene.render.engine = eng; break
        except Exception: pass
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3.0; sun.data.use_shadow = False
    sun.rotation_euler = (0.9, 0, 0.6)
    bpy.context.scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    h = max(max(v.co.z for v in o.data.vertices) for o in objects if o.type == 'MESH')
    cam.location = mathutils.Vector((h * dist * 0.8, -h * dist * 0.9, h * dist))
    look = mathutils.Vector((0, 0, look_z))
    cam.rotation_euler = (look - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.resolution_x = 640
    bpy.context.scene.render.resolution_y = 640
    bpy.context.scene.render.filepath = out_png
    bpy.ops.render.render(write_still=True)
