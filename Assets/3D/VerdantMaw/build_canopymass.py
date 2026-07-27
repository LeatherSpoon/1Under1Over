# build_canopymass.py — Jungle Canopy Mass (Rodin sculpt): the quality
# replacement for the procedural foliage-cloud giants (owner: circled as
# low-quality). Normalized to the OLD Pandora_CanopyFoliage.glb native height
# so every existing placement scale lands the same world size.
# Input: rodin_canopymass_raw.glb (task 7bda2d8a, 2026-07-27).
#
# Heavily decimated (~9k tris): this asset instances ~40× per zone.
#
# Run headless:  blender -b --python build_canopymass.py
# Outputs models/Jungle_CanopyMass.glb; source JungleCanopyMass.blend (watched).
import bpy, sys, os, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rodin_process as rp

RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rodin_canopymass_raw.glb')
OLD_GLB = r'D:\1Under1OverToo\models\Pandora_CanopyFoliage.glb'
OUT_GLB = r'D:\1Under1OverToo\models\Jungle_CanopyMass.glb'
OUT_BLEND = r'D:\1Under1OverToo\Assets\3D\VerdantMaw\JungleCanopyMass.blend'
RENDER = r'C:\Users\Owner\AppData\Local\Temp\claude\D--1Under1OverToo\b5e6352a-c5fb-4c1f-81c3-c15da474a36b\scratchpad\canopymass_check.png'

try:
    bpy.ops.wm.read_homefile(use_empty=True)
    # Measure the OLD asset's native height so placement scales stay valid
    old = rp.join_parts(rp.import_raw(OLD_GLB))
    old_h = max(v.co.z for v in old.data.vertices) - min(v.co.z for v in old.data.vertices)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    print('  old native height: %.2f' % old_h)

    ob = rp.join_parts(rp.import_raw(RAW))
    img = rp.find_diffuse(ob)
    rp.collapse_material(ob, 'CanopyMassBody', img)
    rp.orient_upright(ob)
    rp.normalize(ob, old_h)
    tris = rp.decimate(ob, 9000)
    ob.name = 'CanopyMass_Body'
    rp.export_collection('Jungle_CanopyMass', [ob], OUT_GLB, OUT_BLEND)
    rp.check_render([ob], RENDER, look_z=old_h * 0.45)
    print('CANOPYMASS_OK %.1f KB  tris=%d  nativeH=%.2f (old %.2f)'
          % (os.path.getsize(OUT_GLB) / 1024, tris,
             max(v.co.z for v in ob.data.vertices), old_h))
except Exception:
    print('CANOPYMASS_FAIL: ' + traceback.format_exc()[-1600:])
