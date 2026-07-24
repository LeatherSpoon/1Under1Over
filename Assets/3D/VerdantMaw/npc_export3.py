# Canonical NPC export: re-bind each armature at the ORIGIN (bind state ==
# export state, so inverse-bind matrices cancel exactly regardless of axis
# conversion), export there, then restore the workshop slot layout.
# Vertex groups (the real weights) survive re-parenting; ARMATURE_NAME only
# adds missing groups and a fresh modifier.
import bpy, json

assert bpy.data.filepath.endswith('VerdantMaw.blend'), 'WRONG FILE: ' + bpy.data.filepath

report = {}
for KEY in ('Npc_Sylva', 'Npc_Bram', 'Npc_Sprig'):
    obj = bpy.data.objects[KEY]
    rig = bpy.data.objects[KEY + '_Rig']
    slot = tuple(rig.location)

    obj.parent = None
    for m in list(obj.modifiers):
        if m.type == 'ARMATURE':
            obj.modifiers.remove(m)
    obj.location = (0, 0, 0)
    rig.location = (0, 0, 0)
    bpy.context.view_layer.update()

    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_NAME')
    bpy.context.view_layer.update()

    for o in bpy.data.objects:
        o.select_set(o in (obj, rig))
    bpy.context.view_layer.objects.active = rig
    path = 'D:/1Under1OverToo/models/' + KEY + '.glb'
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_animations=True, export_animation_mode='NLA_TRACKS')

    rig.location = slot
    obj.location = (0, 0, 0)  # local to rig again after re-parent
    bpy.context.view_layer.update()
    report[KEY] = {'rebound_at_origin': True, 'slot_restored': slot}

bpy.ops.wm.save_mainfile()
print(json.dumps(report))
