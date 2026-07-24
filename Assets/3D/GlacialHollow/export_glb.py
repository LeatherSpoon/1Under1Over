# Export the Glacial Hollow pack from GlacialHollow.blend into models/.
#
# Creatures export armature + skinned mesh with export_animation_mode='NLA_TRACKS'
# (the default 'ACTIONS' mode writes EVERY action in the file into EVERY GLB, so
# four rigs would each ship eight clips and Enemy.js's /idle/i match could land
# on another creature's bones — that bug shipped frozen enemies once already).
#
# Props are already normalized by the import pass: Z-up, grounded at z=0,
# centred in XY, facing -y (= game +z, toward the camera), true world scale, so
# the game attaches them at scale 1.0 with no rotation.
import bpy, os, json

OUT = 'D:/1Under1OverToo/models/'

CREATURES = {
    'Creature_Rimeburrow': 'Rimeburrow',
    'Creature_Shardback':  'Shardback',
    'Creature_Cryolisk':   'Cryolisk',
    'Creature_Chillwing':  'Chillwing',
}
PROPS = {
    'Cave_Entrance':      'Hollow_CaveMouth',
    'Cave_Stalagmites':   'Hollow_Stalagmites',
    'Cave_IceCrystals':   'Hollow_IceCrystal',
    'Cave_FrostShroom':   'Hollow_FrostShroom',
    'Cave_IceRubble':     'Hollow_IceRubble',
    'Cave_MammothSkull':  'Hollow_MammothSkull',
    'Cave_BoneArch':      'Hollow_BoneArch',
}


def solo(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


report = []
for mesh_name, out_name in CREATURES.items():
    mesh = bpy.data.objects[mesh_name]
    arm = bpy.data.objects[mesh_name + '_Rig']
    solo([arm, mesh])
    path = OUT + out_name + '.glb'
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_animation_mode='NLA_TRACKS', export_apply=True,
        export_yup=True,
    )
    report.append({'file': out_name + '.glb', 'kb': round(os.path.getsize(path) / 1024),
                   'tracks': [t.name for t in arm.animation_data.nla_tracks]})

for mesh_name, out_name in PROPS.items():
    o = bpy.data.objects[mesh_name]
    solo([o])
    path = OUT + out_name + '.glb'
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_animation_mode='NLA_TRACKS', export_apply=True,
        export_yup=True,
    )
    report.append({'file': out_name + '.glb', 'kb': round(os.path.getsize(path) / 1024)})

print(json.dumps(report, indent=1))
