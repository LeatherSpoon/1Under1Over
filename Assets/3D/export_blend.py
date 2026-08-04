# export_blend.py — headless GLB export for hand-edited .blend sources.
#
#   blender -b <file.blend> --python Assets/3D/export_blend.py
#
# Exports every top-level collection that carries an 'export_offset' custom
# property (the opt-in marker) to D:/1Under1OverToo/models/<CollectionName>.glb.
# The offset lets one .blend hold several assets side by side for editing:
# objects are shifted by -offset for the export, so each GLB lands at origin.
# A collection containing an armature exports with NLA_TRACKS (rigged
# creatures — Idle/Walk track names are what the game matches on).
#
# This is the OWNER-EDIT path: open the .blend, sculpt/paint/tweak, save —
# watch-assets.bat at the repo root notices the save and runs this exporter,
# and the game shows the change on the next page reload. The build_*.py
# generator scripts are BOOTSTRAP tools: re-running one regenerates its asset
# from code and OVERWRITES hand edits. Once a .blend has been hand-edited,
# the .blend is the source of truth — export with this, don't re-generate.
import bpy, os, sys

# Repo-relative (this file lives in <repo>/Assets/3D/) — a hardcoded absolute
# path went stale once already when the repo folder moved.
OUT_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'models'))

def main():
    sc = bpy.context.scene
    exported = []
    for coll in sc.collection.children:
        if 'export_offset' not in coll:
            continue
        off = list(coll['export_offset'])
        objs = list(coll.all_objects)
        if not objs:
            continue
        # Shift the asset to origin for export (roots only — children follow)
        roots = [o for o in objs if o.parent is None or o.parent not in objs]
        for o in roots:
            o.location.x -= off[0]; o.location.y -= off[1]; o.location.z -= off[2]
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        has_rig = any(o.type == 'ARMATURE' for o in objs)
        path = os.path.join(OUT_DIR, coll.name + '.glb')
        kwargs = dict(filepath=path, export_format='GLB', use_selection=True)
        if has_rig:
            kwargs['export_animation_mode'] = 'NLA_TRACKS'
        bpy.ops.export_scene.gltf(**kwargs)
        for o in roots:
            o.location.x += off[0]; o.location.y += off[1]; o.location.z += off[2]
        exported.append('%s.glb (%.1f KB)' % (coll.name, os.path.getsize(path) / 1024))
    if exported:
        print('EXPORTED: ' + ', '.join(exported))
    else:
        print('EXPORTED: nothing — no top-level collection carries an '
              "'export_offset' custom property in this .blend")

main()
