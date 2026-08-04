# diag_orient.py v2 — horizontal profile renders of ONE raw, using the SAME
# proven camera as the build script (to_track_quat) but at zero elevation so
# there is no downward-look ambiguity to misread.
#
#   blender -b --factory-startup --python Assets/3D/ZoneNpcs/diag_orient.py
import bpy, os, sys, math
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(HERE, '..', 'VerdantMaw'))
import rodin_process as rp

OUT = os.path.join(HERE, 'renders_diag')
os.makedirs(OUT, exist_ok=True)
RAW = os.path.join(HERE, 'rodin_Npc_Cindersmith_raw.glb')

bpy.ops.wm.read_homefile(use_empty=True)
meshes = rp.import_raw(RAW)
obj = rp.join_parts(meshes)

wv = [obj.matrix_world @ v.co for v in obj.data.vertices]
lo = Vector((min(v.x for v in wv), min(v.y for v in wv), min(v.z for v in wv)))
hi = Vector((max(v.x for v in wv), max(v.y for v in wv), max(v.z for v in wv)))
ctr = (lo + hi) / 2
obj.location = obj.location - ctr
bpy.context.view_layer.update()
R = max(hi - lo)

for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
    try:
        bpy.context.scene.render.engine = eng
        break
    except Exception:
        pass
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
sun.data.energy = 4.0
sun.data.use_shadow = False
sun.rotation_euler = (0.9, 0, 0.6)
bpy.context.scene.collection.objects.link(sun)
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
bpy.context.scene.collection.objects.link(cam)
bpy.context.scene.camera = cam
bpy.context.scene.render.resolution_x = 512
bpy.context.scene.render.resolution_y = 512


def shoot(loc, name):
    cam.location = Vector(loc)
    cam.rotation_euler = (Vector((0, 0, 0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)


d = R * 2.2
shoot((d, 0, 0),  'profile_from_plusX.png')   # full lying profile
shoot((0, -d, 0), 'axis_from_minusY.png')     # down the long axis
print('DIAG2 DONE')
