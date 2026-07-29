# build_bamboogrove.py — golden bamboo grove clump (Rodin sculpt): the
# transitional phase's signature flora (Raya/Kumandra palette, northern
# bands). Input: rodin_bamboogrove_raw.glb (task 3f006c8d, 2026-07-27).
#
# Run headless:  blender -b --python build_bamboogrove.py
# Outputs models/Jungle_BambooGrove.glb; source BambooGrove.blend (watched).
import bpy, sys, os, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rodin_process as rp

RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rodin_bamboogrove_raw.glb')
OUT_GLB = r'D:\1Under1OverToo\models\Jungle_BambooGrove.glb'
OUT_BLEND = r'D:\1Under1OverToo\Assets\3D\VerdantMaw\BambooGrove.blend'
RENDER = r'C:\Users\Owner\AppData\Local\Temp\claude\D--1Under1OverToo\b5e6352a-c5fb-4c1f-81c3-c15da474a36b\scratchpad\bamboo_check.png'

HEIGHT = 4.0   # pre-sink; ~3.15 shows above ground after the mound burial
SINK = 0.85    # Rodin modeled the "bare ground" as an earth mound — bury it
               # below z=0 (the pedestal-translate trick) so the canes emerge
               # from the game's own ground; a hummock shoulder peeking is fine

try:
    bpy.ops.wm.read_homefile(use_empty=True)
    ob = rp.join_parts(rp.import_raw(RAW))
    img = rp.find_diffuse(ob)
    rp.collapse_material(ob, 'BambooGroveBody', img)
    rp.orient_upright(ob)
    rp.normalize(ob, HEIGHT)
    for v in ob.data.vertices: v.co.z -= SINK
    tris = rp.decimate(ob, 10000)
    ob.name = 'BambooGrove_Body'
    rp.export_collection('Jungle_BambooGrove', [ob], OUT_GLB, OUT_BLEND)
    rp.check_render([ob], RENDER, look_z=1.5)
    print('BAMBOO_OK %.1f KB  tris=%d' % (os.path.getsize(OUT_GLB) / 1024, tris))
except Exception:
    print('BAMBOO_FAIL: ' + traceback.format_exc()[-1600:])
