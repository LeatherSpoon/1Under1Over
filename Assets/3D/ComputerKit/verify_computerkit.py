# verify_computerkit.py — QA renders of the EXPORTED ComputerKit GLBs.
# Imports each models/CK1_*.glb into a fresh scene with a ground plane and
# renders two low-elevation views (camera up pinned via 'Z' track) so
# upside-down / lying-flat mistakes are unambiguous.
# Run: & "...\blender.exe" -b --factory-startup --python verify_computerkit.py
import bpy, math, os
import mathutils

MODELS = r'D:\2Under2Over\models'
RENDERS = r'D:\2Under2Over\Assets\3D\ComputerKit\renders'
os.makedirs(RENDERS, exist_ok=True)

PIECES = ['CK1_Wall', 'CK1_WallDoor', 'CK1_RoofPanel', 'CK1_FieldTerminal',
          'CK1_MissionServer', 'CK1_IntegrationBench', 'CK1_ExpeditionRack',
          'CK1_Pallet']


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def render(name, obs, out_png, az_deg, el_deg):
    scene = bpy.context.scene
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            scene.render.engine = eng
            break
        except Exception:
            pass
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for ob in obs:
        for corner in ob.bound_box:
            w = ob.matrix_world @ mathutils.Vector(corner)
            for i in range(3):
                mn[i] = min(mn[i], w[i])
                mx[i] = max(mx[i], w[i])
    center = mathutils.Vector([(mn[i] + mx[i]) / 2 for i in range(3)])
    radius = max(mx[i] - mn[i] for i in range(3)) / 2 + 0.3
    cam = bpy.data.objects['V_Cam']
    az, el = math.radians(az_deg), math.radians(el_deg)
    dist = radius * 3.2
    cam.location = center + mathutils.Vector((
        dist * math.cos(el) * math.sin(az),
        -dist * math.cos(el) * math.cos(az),
        dist * math.sin(el)))
    f = (center - cam.location).normalized()
    r = f.cross(mathutils.Vector((0, 0, 1)))
    if r.length < 1e-6:
        r = mathutils.Vector((1, 0, 0))
    r.normalize()
    u = r.cross(f)
    cam.rotation_euler = mathutils.Matrix((r, u, -f)).transposed().to_euler()
    cam.data.lens = 60
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.filepath = out_png
    bpy.ops.render.render(write_still=True)


def main():
    for name in PIECES:
        reset_scene()
        scene = bpy.context.scene
        # ground plane
        bpy.ops.mesh.primitive_plane_add(size=40)
        ground = bpy.context.view_layer.objects.active
        gm = bpy.data.materials.new('Ground')
        gm.use_nodes = True
        gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.18, 0.25, 0.18, 1)
        ground.data.materials.append(gm)
        sun = bpy.data.objects.new('V_Sun', bpy.data.lights.new('V_Sun', 'SUN'))
        sun.data.energy = 3.5
        sun.data.use_shadow = False
        sun.rotation_euler = (0.8, 0, 0.7)
        scene.collection.objects.link(sun)
        cam = bpy.data.objects.new('V_Cam', bpy.data.cameras.new('V_Cam'))
        scene.collection.objects.link(cam)
        scene.camera = cam

        path = os.path.join(MODELS, name + '.glb')
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        obs = [o for o in set(bpy.data.objects) - before if o.type == 'MESH']
        render(name, obs, os.path.join(RENDERS, name + '_check_a.png'), az_deg=25, el_deg=18)
        render(name, obs, os.path.join(RENDERS, name + '_check_b.png'), az_deg=115, el_deg=46)
        print('verified renders for', name)


main()
