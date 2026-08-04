# qa_renders.py — pre-rig QA renders for the ZoneNpcs raws.
#
#   blender -b --factory-startup --python Assets/3D/ZoneNpcs/qa_renders.py
#
# For each rodin_Npc_*_raw.glb: import, join, ground+center (QA copy only —
# the raw file on disk is untouched), then render 4 yaws + a face close-up
# into renders_qa/. Prints native dims per NPC. Judge faces BEFORE rigging
# (Duskdart lesson); pick per-NPC yaw_fix for build_npcs.py from the sweep.
import bpy, os, sys, math, glob, json
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(HERE, '..', 'VerdantMaw'))
import rodin_process as rp

OUT = os.path.join(HERE, 'renders_qa')
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_homefile(use_empty=True)


def setup_render_rig():
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            bpy.context.scene.render.engine = eng
            break
        except Exception:
            pass
    sun = bpy.data.objects.new('RenderSun', bpy.data.lights.new('RenderSun', 'SUN'))
    sun.data.energy = 3.0
    sun.data.use_shadow = False
    sun.rotation_euler = (0.9, 0, 0.6)
    bpy.context.scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('RenderCam', bpy.data.cameras.new('RenderCam'))
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    bpy.context.scene.render.resolution_x = 512
    bpy.context.scene.render.resolution_y = 512
    return cam


def render_at(cam, height, out_png, yaw_deg, dist_mult=2.1, look_up=0.45):
    d = max(1.2, height * dist_mult)
    yaw = math.radians(yaw_deg)
    cam.location = Vector((d * math.sin(yaw), -d * math.cos(yaw),
                           height * 0.6 + d * 0.35))
    look = Vector((0, 0, height * look_up))
    cam.rotation_euler = (look - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = out_png
    bpy.ops.render.render(write_still=True)


cam = setup_render_rig()
report = {}
raws = sorted(glob.glob(os.path.join(HERE, 'rodin_Npc_*_raw.glb')))
for raw in raws:
    key = os.path.basename(raw)[len('rodin_'):-len('_raw.glb')]
    meshes = rp.import_raw(raw)
    obj = rp.join_parts(meshes)
    obj.name = key
    # Ground + center in the QA copy so the shared camera rig frames it.
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    ctr = (lo + hi) / 2
    obj.data.transform(Matrix.Translation(Vector((-ctr.x, -ctr.y, -lo.z))))
    obj.location = (0, 0, 0)
    dims = (hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
    H = dims[2]
    for yaw in (0, 90, 180, 270):
        render_at(cam, H, os.path.join(OUT, '%s_y%03d.png' % (key, yaw)), yaw)
    render_at(cam, H, os.path.join(OUT, '%s_face.png' % key), 0,
              dist_mult=0.9, look_up=0.85)
    report[key] = {'dims': [round(d, 3) for d in dims],
                   'tris': len(obj.data.polygons)}
    # Clear the object before the next import so renders never overlap.
    bpy.data.objects.remove(obj, do_unlink=True)
    for _ in range(3):
        bpy.data.orphans_purge(do_recursive=True)

print('QA_REPORT ' + json.dumps(report))
