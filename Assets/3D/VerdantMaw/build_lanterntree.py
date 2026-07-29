# build_lanterntree.py — the Emberglade's Lantern Tree (Rodin sculpt).
# Original design: ancient gnarled tree hung with amber lantern-fruit.
# Input: rodin_lanterntree_raw.glb (task e53b40bf-e125, 2026-07-27).
#
# Pipeline: rodin_process common recipe, then the LANTERN GLOW SPLIT — faces
# whose diffuse texel is bright + warm move to a 'LanternGlow' material whose
# emission is the same texture. The in-game reveal re-shade skips /glow/-named
# materials, so the fruits keep their self-glow while the body goes reveal-toon.
#
# Run headless:  blender -b --python build_lanterntree.py
# Outputs models/Ember_LanternTree.glb; source LanternTree.blend (watched).
import bpy, sys, os, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rodin_process as rp

RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rodin_lanterntree_raw.glb')
OUT_GLB = r'D:\1Under1OverToo\models\Ember_LanternTree.glb'
OUT_BLEND = r'D:\1Under1OverToo\Assets\3D\VerdantMaw\LanternTree.blend'
RENDER = r'C:\Users\Owner\AppData\Local\Temp\claude\D--1Under1OverToo\b5e6352a-c5fb-4c1f-81c3-c15da474a36b\scratchpad\lanterntree_check.png'

HEIGHT = 8.0  # hero scale — the glade's centerpiece (collision r 2.3 at the flare)

def lantern_split(ob, mat_body):
    """Move bright-warm-texel faces onto a LanternGlow material (emissive)."""
    img = None
    bsdf = next(n for n in mat_body.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for l in mat_body.node_tree.links:
        if l.to_node == bsdf and l.to_socket.name == 'Base Color' and l.from_node.type == 'TEX_IMAGE':
            img = l.from_node.image
    if img is None:
        print('  no diffuse — skip glow split'); return 0
    w, h = img.size
    px = list(img.pixels)
    uvl = ob.data.uv_layers.active.data
    def texel(u, v):
        x = min(w - 1, max(0, int(u % 1.0 * w)))
        y = min(h - 1, max(0, int(v % 1.0 * h)))
        i = (y * w + x) * 4
        return px[i], px[i + 1], px[i + 2]
    glow = bpy.data.materials.new('LanternGlow')
    glow.use_nodes = True
    gb = glow.node_tree.nodes.get('Principled BSDF')
    gb.inputs['Roughness'].default_value = 1.0
    tex = glow.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = img
    glow.node_tree.links.new(tex.outputs['Color'], gb.inputs['Base Color'])
    glow.node_tree.links.new(tex.outputs['Color'], gb.inputs['Emission Color'])
    gb.inputs['Emission Strength'].default_value = 2.2
    ob.data.materials.append(glow)

    marks = []
    for p in ob.data.polygons:
        u = sum(uvl[li].uv[0] for li in p.loop_indices) / len(p.loop_indices)
        v = sum(uvl[li].uv[1] for li in p.loop_indices) / len(p.loop_indices)
        r, g, b = texel(u, v)
        marks.append(r > 0.5 and r > b * 1.15 and (r + g + b) / 3 > 0.38)
    # despeckle: two majority-vote passes over edge-adjacent faces
    edge_faces = {}
    for p in ob.data.polygons:
        for ek in p.edge_keys:
            edge_faces.setdefault(ek, []).append(p.index)
    for _ in range(2):
        nxt = marks[:]
        for p in ob.data.polygons:
            nbrs = [f for ek in p.edge_keys for f in edge_faces[ek] if f != p.index]
            if not nbrs: continue
            vote = sum(1 for f in nbrs if marks[f])
            if marks[p.index] and vote == 0: nxt[p.index] = False
            elif not marks[p.index] and vote == len(nbrs): nxt[p.index] = True
        marks = nxt
    n = 0
    for p in ob.data.polygons:
        if marks[p.index]:
            p.material_index = 1; n += 1
    return n

def cut_ground_slab(ob, z_lim=0.3, r_keep=2.45):
    """Rodin bakes a flat grass base plate under grounded prompts. Delete
    every face lying entirely below z_lim AND outside r_keep — the root
    flare (which rises) and the under-trunk mound (inside r_keep) survive.
    Open bottom edges are invisible at the game's 46° down-look."""
    import bmesh as _bmesh
    bm = _bmesh.new()
    bm.from_mesh(ob.data)
    doomed = [f for f in bm.faces
              if all(v.co.z < z_lim for v in f.verts)
              and all((v.co.x ** 2 + v.co.y ** 2) ** 0.5 > r_keep for v in f.verts)]
    _bmesh.ops.delete(bm, geom=doomed, context='FACES')
    bm.to_mesh(ob.data); bm.free()
    return len(doomed)

try:
    bpy.ops.wm.read_homefile(use_empty=True)
    ob = rp.join_parts(rp.import_raw(RAW))
    img = rp.find_diffuse(ob)
    mat = rp.collapse_material(ob, 'LanternTreeBody', img)
    rp.orient_upright(ob)
    rp.normalize(ob, HEIGHT)
    cut = cut_ground_slab(ob)
    print('  slab faces cut: %d' % cut)
    rp.normalize(ob, HEIGHT)  # re-ground/center after the cut
    tris = rp.decimate(ob, 26000)
    glow_faces = lantern_split(ob, mat)
    ob.name = 'LanternTree_Body'
    rp.export_collection('Ember_LanternTree', [ob], OUT_GLB, OUT_BLEND)
    rp.check_render([ob], RENDER, look_z=3.6)
    vs = ob.data.vertices
    print('LANTERNTREE_OK %.1f KB  tris=%d glowFaces=%d  bbox x[%.2f,%.2f] y[%.2f,%.2f] z[%.2f,%.2f]'
          % (os.path.getsize(OUT_GLB) / 1024, tris, glow_faces,
             min(v.co.x for v in vs), max(v.co.x for v in vs),
             min(v.co.y for v in vs), max(v.co.y for v in vs),
             min(v.co.z for v in vs), max(v.co.z for v in vs)))
except Exception:
    print('LANTERNTREE_FAIL: ' + traceback.format_exc()[-1600:])
