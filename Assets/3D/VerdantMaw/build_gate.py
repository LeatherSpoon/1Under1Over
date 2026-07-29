# build_gate.py — the Root Gate: an arch of two curved root-horns straddling
# the worn trail at the Hometree helix foot, so the canopy ascent's entrance
# is unmissable from anywhere on the approach ("Arriving to the canopy is not
# easy" — owner). Glow-tipped horns + emissive shelf fungi read at night.
#
# Run headless:  blender -b --python build_gate.py
# Outputs models/Canopy_RootGate.glb; source CanopyGate.blend (watched, so the
# owner can reshape the horns in Blender and save).
# Native scale = world scale (game placement scale 1.0), grounded at z 0,
# legs at x ±1.45 (game collision circles mirror this in canopy.js), passage
# along Blender -y = game +z (camera side).
import bpy, math, os, traceback

OUT_GLB = r'D:\1Under1OverToo\models\Canopy_RootGate.glb'
OUT_BLEND = r'D:\1Under1OverToo\Assets\3D\VerdantMaw\CanopyGate.blend'

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hex_lin(h):
    return tuple(srgb_to_linear(((h >> s) & 255) / 255) for s in (16, 8, 0)) + (1.0,)

def mat(name, hexcol, emit=0.0, emit_col=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = hex_lin(hexcol)
    b.inputs['Roughness'].default_value = 1.0
    b.inputs['Metallic'].default_value = 0.0
    if emit:
        b.inputs['Emission Color'].default_value = hex_lin(emit_col if emit_col else hexcol)
        b.inputs['Emission Strength'].default_value = emit
    return m

def bezier(points, radii, bevel):
    cu = bpy.data.curves.new('c', 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(points) - 1)
    for p, co, r in zip(sp.bezier_points, points, radii):
        p.co = co; p.radius = r
        p.handle_left_type = p.handle_right_type = 'AUTO'
    cu.bevel_depth = bevel; cu.bevel_resolution = 4; cu.use_fill_caps = True
    ob = bpy.data.objects.new('horn', cu)
    bpy.context.scene.collection.objects.link(ob)
    return ob

try:
    bpy.ops.wm.read_homefile(use_empty=True)
    # Bark self-glows faintly — night-zone rule: living landmarks are
    # bioluminescent, and an unlit dark arch vanishes against the trunk.
    bark = mat('RootGateBark', 0x46644a, emit=0.35, emit_col=0x3fa98e)
    glow = mat('RootGateGlow', 0x9ff5e8, emit=5.0)
    fungusM = mat('RootGateFungus', 0xf2a8d8, emit=2.8)

    parts = []
    for sign in (1, -1):
        # main horn: base outside, arcing up and inward over the passage
        parts.append(bezier(
            [(sign * 1.45, 0.0, -0.15), (sign * 1.22, -0.12, 1.7), (sign * 0.38, -0.22, 3.0)],
            [1.0, 0.62, 0.24], 0.30))
        # two rootlets flaring off the base
        parts.append(bezier(
            [(sign * 1.35, 0.1, 0.25), (sign * 2.0, 0.5, 0.02)], [0.45, 0.12], 0.20))
        parts.append(bezier(
            [(sign * 1.4, -0.15, 0.35), (sign * 2.1, -0.55, 0.0)], [0.4, 0.1], 0.19))
    for ob in parts:
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True); bpy.context.view_layer.objects.active = ob
        bpy.ops.object.convert(target='MESH')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts: ob.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    body = parts[0]; body.name = 'RootGate_Body'
    body.data.materials.clear(); body.data.materials.append(bark)
    # Gnarl the smooth bevel tubes into root-bark: two octaves of noise
    # displacement (coarse knots + fine grain)
    for tex_name, size, strength in (('gateN1', 0.7, 0.10), ('gateN2', 0.22, 0.035)):
        tex = bpy.data.textures.new(tex_name, 'CLOUDS'); tex.noise_scale = size
        md = body.modifiers.new(tex_name, 'DISPLACE')
        md.texture = tex; md.strength = strength; md.mid_level = 0.5
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True); bpy.context.view_layer.objects.active = body
    for md in list(body.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
    bpy.ops.object.shade_smooth()

    def blob(loc, scale, m, squash=0.45):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=loc)
        ob = bpy.context.active_object
        ob.scale = (scale, scale, scale * squash)
        ob.data.materials.append(m)
        bpy.ops.object.shade_smooth()
        return ob

    extras = []
    # glow bulbs on the horn tips — the night beacon pair
    extras.append(blob((0.38, -0.22, 3.02), 0.26, glow, squash=1.0))
    extras.append(blob((-0.38, -0.22, 3.02), 0.26, glow, squash=1.0))
    # shelf fungi on the camera face of the legs
    extras.append(blob((1.32, -0.36, 0.95), 0.20, fungusM))
    extras.append(blob((-1.30, -0.34, 1.35), 0.18, fungusM))
    extras.append(blob((1.14, -0.36, 1.90), 0.15, fungusM))
    extras.append(blob((-1.18, -0.34, 0.62), 0.14, fungusM))

    coll = bpy.data.collections.new('Canopy_RootGate')
    bpy.context.scene.collection.children.link(coll)
    coll['export_offset'] = [0, 0, 0]
    for ob in [body] + extras:
        for c in list(ob.users_collection): c.objects.unlink(ob)
        coll.objects.link(ob)

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True)

    # Verification render from the game's ~46° south camera
    scn = bpy.context.scene
    try: scn.render.engine = 'BLENDER_EEVEE_NEXT'
    except Exception: pass
    scn.render.resolution_x = scn.render.resolution_y = 640
    scn.render.film_transparent = False
    world = scn.world or bpy.data.worlds.new('W'); scn.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.02, 0.06, 0.07, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.5
    sun = bpy.data.lights.new('S', 'SUN'); sun.energy = 1.2; sun.use_shadow = False
    sun_ob = bpy.data.objects.new('S', sun); scn.collection.objects.link(sun_ob)
    sun_ob.rotation_euler = (math.radians(50), 0, math.radians(15))
    from mathutils import Vector
    cam_d = bpy.data.cameras.new('C'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = 6.5
    cam = bpy.data.objects.new('C', cam_d); scn.collection.objects.link(cam); scn.camera = cam
    aim = Vector((0, 0, 1.4)); a = math.radians(46)
    cam.location = aim + Vector((0.15, -math.cos(a), math.sin(a))).normalized() * 16
    cam.rotation_euler = (aim - cam.location).normalized().to_track_quat('-Z', 'Y').to_euler()
    scn.render.filepath = r'C:\Users\Owner\AppData\Local\Temp\claude\D--1Under1OverToo\b5e6352a-c5fb-4c1f-81c3-c15da474a36b\scratchpad\gate_render.png'
    bpy.ops.render.render(write_still=True)
    for o in (sun_ob, cam): bpy.data.objects.remove(o, do_unlink=True)

    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print('GATE_OK %.1f KB' % (os.path.getsize(OUT_GLB) / 1024))
except Exception:
    print('GATE_FAIL: ' + traceback.format_exc()[-1600:])
