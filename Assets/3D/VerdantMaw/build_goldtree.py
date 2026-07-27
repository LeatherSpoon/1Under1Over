# build_goldtree.py — warm gold-green broadleaf tree (Rodin sculpt): the
# transitional phase's canopy tree (Raya/Kumandra palette, northern bands).
# Input: rodin_goldtree_raw.glb (task 8b018bfe, 2026-07-27).
#
# Run headless:  blender -b --python build_goldtree.py
# Outputs models/Jungle_GoldTree.glb; source GoldTree.blend (watched).
import bpy, sys, os, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rodin_process as rp

RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rodin_goldtree_raw.glb')
OUT_GLB = r'D:\1Under1OverToo\models\Jungle_GoldTree.glb'
OUT_BLEND = r'D:\1Under1OverToo\Assets\3D\VerdantMaw\GoldTree.blend'
RENDER = r'C:\Users\Owner\AppData\Local\Temp\claude\D--1Under1OverToo\b5e6352a-c5fb-4c1f-81c3-c15da474a36b\scratchpad\goldtree_check.png'

HEIGHT = 3.1  # native ≈ the maw jungle trees — flank scales 1.35-1.75 match

try:
    bpy.ops.wm.read_homefile(use_empty=True)
    ob = rp.join_parts(rp.import_raw(RAW))
    img = rp.find_diffuse(ob)
    rp.collapse_material(ob, 'GoldTreeBody', img)
    rp.orient_upright(ob)
    rp.normalize(ob, HEIGHT)
    tris = rp.decimate(ob, 11000)
    ob.name = 'GoldTree_Body'
    rp.export_collection('Jungle_GoldTree', [ob], OUT_GLB, OUT_BLEND)
    rp.check_render([ob], RENDER, look_z=1.4)
    print('GOLDTREE_OK %.1f KB  tris=%d' % (os.path.getsize(OUT_GLB) / 1024, tris))
except Exception:
    print('GOLDTREE_FAIL: ' + traceback.format_exc()[-1600:])
