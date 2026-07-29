# Export the Landing Site pack from LandingSite.blend into models/.
#
# Props are normalized by normalize_props.py first: Z-up, grounded at z=0,
# centred in XY, true world scale — so the game attaches them at scale 1.0.
#
# Creatures/NPCs export armature + skinned mesh with export_animation_mode=
# 'NLA_TRACKS'. The default 'ACTIONS' mode writes EVERY action in the file into
# EVERY GLB, so each rig would ship every other rig's clips and Enemy.js's
# /idle/i match could land on another creature's bones.
import bpy, os, json

OUT = 'D:/1Under1OverToo/models/'

PROPS = {
    'Landing_GrassTuft':   'Landing_GrassTuft',
    'Landing_Wildflowers': 'Landing_Wildflowers',
    'Landing_Bush':        'Landing_Bush',
    'Landing_FallenLog':   'Landing_FallenLog',
    'Landing_MineAdit':    'Landing_MineAdit',
    'Landing_RockOutcrop': 'Landing_RockOutcrop',
    'Landing_Tent':        'Landing_Tent',
    'Landing_Campfire':    'Landing_Campfire',
}

RIGGED = {
    'Creature_Mossback':  'Mossback',
    'Creature_Burrfang':  'Burrfang',
    'Creature_Stiltbeak': 'Stiltbeak',
    'Boss_ScrapTyrant':   'Boss_ScrapTyrant',
    'Npc_Mara':           'Npc_Mara',
    'Npc_Finch':          'Npc_Finch',
}


def solo(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


report = []

for src, out_name in PROPS.items():
    o = bpy.data.objects.get(src)
    if not o:
        continue
    solo([o])
    path = OUT + out_name + '.glb'
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_animation_mode='NLA_TRACKS', export_apply=True, export_yup=True,
    )
    report.append({'file': out_name + '.glb', 'kb': round(os.path.getsize(path) / 1024)})

for src, out_name in RIGGED.items():
    mesh = bpy.data.objects.get(src)
    arm = bpy.data.objects.get(src + '_Rig')
    if not mesh or not arm:
        continue
    solo([arm, mesh])
    path = OUT + out_name + '.glb'
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_animation_mode='NLA_TRACKS', export_apply=True, export_yup=True,
    )
    report.append({'file': out_name + '.glb', 'kb': round(os.path.getsize(path) / 1024),
                   'tracks': [t.name for t in arm.animation_data.nla_tracks]})

print(json.dumps(report, indent=1))
