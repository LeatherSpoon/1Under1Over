import bpy, sys, os, math, mathutils
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rodin_process as rp
OUT = r'C:\Users\Owner\AppData\Local\Temp\claude\D--1Under1OverToo\b5e6352a-c5fb-4c1f-81c3-c15da474a36b\scratchpad\goldtree_side.png'
bpy.ops.wm.read_homefile(use_empty=True)
obs = rp.import_raw(r'D:\1Under1OverToo\models\Jungle_GoldTree.glb')
for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
    try:
        bpy.context.scene.render.engine = eng; break
    except Exception: pass
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
sun.data.energy = 3.0; sun.data.use_shadow = False
sun.rotation_euler = (1.1, 0, 0.4)
bpy.context.scene.collection.objects.link(sun)
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
bpy.context.scene.collection.objects.link(cam)
bpy.context.scene.camera = cam
cam.location = mathutils.Vector((7.5, -1.5, 1.6))
look = mathutils.Vector((0, 0, 1.5))
cam.rotation_euler = (look - cam.location).to_track_quat('-Z', 'Y').to_euler()
bpy.context.scene.render.resolution_x = 640
bpy.context.scene.render.resolution_y = 640
bpy.context.scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('SIDE_OK')
