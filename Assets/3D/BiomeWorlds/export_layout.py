"""
export_layout.py — Blender → game layout exporter for the expanded biomes.

Run inside Blender (scripting tab, or via the blender-mcp socket) with the
biome's .blend open:

    import export_layout
    export_layout.export(zone="lagoonCoast",
                         out="D:/1Under1OverToo/js/scene/zones/LagoonCoast/layout.generated.js")

It harvests the scene's export collections into the shape defined by
js/scene/layoutSchema.js, runs the same seven rejection rules the Node
validator enforces, and writes a JS module. Anything outside the named export
collections — reference geometry, notes, cameras, annotations — is ignored.

Conventions live in README.md next to this file. The short version:

    Coordinate mapping   Blender X → game x,  Blender Y → game z,  Blender Z → height
    Collections          Terrain_Fixed, Terrain_Soft, Routes, Markers, Regions,
                         Districts     (anything else is reference-only)
    Custom properties    set per object; `id` defaults to the object name

The Node validator is the authority: this script refuses to write a file that
would fail it, but tests/systems/biomeLayout.test.js is what gates CI.
"""

import json
import math
import os

import bpy  # noqa: F401  (Blender-only import)

# ── Conventions, mirrored from js/scene/layoutSchema.js ─────────────────────

PROP_COLLECTIONS = {"Terrain_Fixed": "fixed", "Terrain_Soft": "soft"}
ROUTE_COLLECTION = "Routes"
MARKER_COLLECTION = "Markers"
REGION_COLLECTION = "Regions"
DISTRICT_COLLECTION = "Districts"

ROUTE_TYPES = {"arterial", "collector", "local", "express", "interchange"}
MARKER_KINDS = {
    "entrance", "portal", "interchange", "npc",
    "enemy", "resource", "landmark", "mechanic",
}

LAYOUT_VERSION = 1


class ExportError(Exception):
    """Raised with every problem found, so one run reports them all."""


def _finite(value):
    return isinstance(value, (int, float)) and math.isfinite(value)


def _round(value, places=3):
    """Keep the generated file readable and diff-stable."""
    return round(float(value), places)


def _prop(obj, key, default=None):
    """Read a Blender custom property."""
    try:
        return obj[key]
    except KeyError:
        return default


def _collection_of(obj, names):
    for coll in obj.users_collection:
        if coll.name in names:
            return coll.name
    return None


def _objects_in(collection_name):
    coll = bpy.data.collections.get(collection_name)
    return list(coll.all_objects) if coll else []


# ── Harvest ─────────────────────────────────────────────────────────────────

def _harvest_props(errors):
    out = []
    for coll_name, terrain in PROP_COLLECTIONS.items():
        for obj in _objects_in(coll_name):
            if obj.type not in {"MESH", "EMPTY"}:
                continue
            model = _prop(obj, "model")
            if not model:
                errors.append(f"{obj.name}: missing required custom property 'model'")
                continue

            # Blender Y → game z. Uniform scale only: the game clones a GLB at a
            # single scale, so a non-uniform Blender scale would silently lie.
            sx, sy, sz = obj.scale
            if max(abs(sx - sy), abs(sx - sz)) > 1e-4:
                errors.append(f"{obj.name}: non-uniform scale {tuple(obj.scale)} cannot be exported")

            entry = {
                "id": _prop(obj, "id", obj.name),
                "model": model,
                "x": _round(obj.location.x),
                "z": _round(obj.location.y),
                "scale": _round(sx),
                "rotY": _round(obj.rotation_euler.z),
                "terrain": terrain,
                "collection": coll_name,
            }
            radius = _prop(obj, "r")
            if radius is not None:
                entry["r"] = _round(radius)
            tint = _prop(obj, "tint")
            if tint is not None:
                entry["tint"] = int(tint)
            district = _prop(obj, "district")
            if district:
                entry["district"] = district
            out.append(entry)
    return out


def _harvest_routes(errors):
    out = []
    for obj in _objects_in(ROUTE_COLLECTION):
        if obj.type != "CURVE":
            errors.append(f"{obj.name}: objects in {ROUTE_COLLECTION} must be curves")
            continue
        route_type = _prop(obj, "type")
        if route_type not in ROUTE_TYPES:
            errors.append(f"{obj.name}: invalid route type {route_type!r}")
            continue
        width = _prop(obj, "width")
        if not _finite(width):
            errors.append(f"{obj.name}: missing or non-finite 'width'")
            continue

        points = []
        matrix = obj.matrix_world
        for spline in obj.data.splines:
            source = spline.bezier_points if spline.type == "BEZIER" else spline.points
            for point in source:
                world = matrix @ point.co.to_3d() if spline.type != "BEZIER" \
                    else matrix @ point.co
                points.append([_round(world.x), _round(world.y)])
        if len(points) < 2:
            errors.append(f"{obj.name}: a route needs at least 2 points")
            continue

        out.append({
            "id": _prop(obj, "id", obj.name),
            "type": route_type,
            "width": _round(width),
            "points": points,
            "collection": ROUTE_COLLECTION,
        })
    return out


def _harvest_markers(errors):
    out = []
    for obj in _objects_in(MARKER_COLLECTION):
        kind = _prop(obj, "kind")
        if kind not in MARKER_KINDS:
            errors.append(f"{obj.name}: invalid marker kind {kind!r}")
            continue
        entry = {
            "id": _prop(obj, "id", obj.name),
            "kind": kind,
            "x": _round(obj.location.x),
            "z": _round(obj.location.y),
            "rotY": _round(obj.rotation_euler.z),
            "collection": MARKER_COLLECTION,
        }
        for optional in ("propId", "target", "label", "archetype", "materialType"):
            value = _prop(obj, optional)
            if value:
                entry[optional] = value
        out.append(entry)
    return out


def _harvest_regions(errors):
    out = []
    for obj in _objects_in(REGION_COLLECTION):
        models = _prop(obj, "models")
        if isinstance(models, str):
            models = [m.strip() for m in models.split(",") if m.strip()]
        if not models:
            errors.append(f"{obj.name}: missing 'models' (comma-separated keys)")
            continue

        seed = _prop(obj, "seed")
        density = _prop(obj, "density")
        if not _finite(seed) or not _finite(density):
            errors.append(f"{obj.name}: 'seed' and 'density' must both be finite numbers")
            continue

        terrain = _prop(obj, "terrain", "soft")
        if terrain not in ("fixed", "soft"):
            errors.append(f"{obj.name}: terrain must be 'fixed' or 'soft'")
            continue

        # An empty's display radius, or a mesh's bounding box, gives the shape.
        if obj.type == "EMPTY":
            shape = {
                "kind": "circle",
                "x": _round(obj.location.x),
                "z": _round(obj.location.y),
                "r": _round(obj.empty_display_size * obj.scale.x),
            }
        else:
            corners = [obj.matrix_world @ v.co for v in obj.data.vertices]
            if not corners:
                errors.append(f"{obj.name}: region mesh has no vertices")
                continue
            shape = {
                "kind": "rect",
                "minX": _round(min(c.x for c in corners)),
                "maxX": _round(max(c.x for c in corners)),
                "minZ": _round(min(c.y for c in corners)),
                "maxZ": _round(max(c.y for c in corners)),
            }

        entry = {
            "id": _prop(obj, "id", obj.name),
            "seed": int(seed),
            "terrain": terrain,
            "density": _round(density, 5),
            "models": models,
            "shape": shape,
            "collection": REGION_COLLECTION,
        }
        for optional in ("scale", "scaleJitter", "r"):
            value = _prop(obj, optional)
            if value is not None:
                entry[optional] = _round(value)
        out.append(entry)
    return out


def _harvest_districts(errors):
    out = []
    for obj in _objects_in(DISTRICT_COLLECTION):
        radius = _prop(obj, "r", obj.empty_display_size * obj.scale.x)
        if not _finite(radius):
            errors.append(f"{obj.name}: district needs a finite radius 'r'")
            continue
        out.append({
            "id": _prop(obj, "id", obj.name),
            "label": _prop(obj, "label", obj.name),
            "x": _round(obj.location.x),
            "z": _round(obj.location.y),
            "r": _round(radius),
            "collection": DISTRICT_COLLECTION,
        })
    return out


def _scene_bounds(errors):
    """Bounds come from an object named `Bounds` — a plane or an empty."""
    obj = bpy.data.objects.get("Bounds")
    if obj is None:
        errors.append("scene is missing a 'Bounds' object defining the footprint")
        return None
    if obj.type == "MESH":
        corners = [obj.matrix_world @ v.co for v in obj.data.vertices]
        return {
            "minX": _round(min(c.x for c in corners)),
            "maxX": _round(max(c.x for c in corners)),
            "minZ": _round(min(c.y for c in corners)),
            "maxZ": _round(max(c.y for c in corners)),
        }
    half = obj.empty_display_size * obj.scale.x
    return {
        "minX": _round(obj.location.x - half),
        "maxX": _round(obj.location.x + half),
        "minZ": _round(obj.location.y - half),
        "maxZ": _round(obj.location.y + half),
    }


# ── Local validation (mirrors the Node rules; the Node one is authoritative) ──

def _validate(layout, errors):
    bounds = layout.get("bounds")
    seen = {}

    def check(entries, group):
        for i, entry in enumerate(entries):
            path = f"{group}[{i}] ({entry.get('id')})"
            entry_id = entry.get("id")
            if entry_id in seen:
                errors.append(f"{path}: duplicate id, already used by {seen[entry_id]}")
            else:
                seen[entry_id] = path

            for key in ("x", "z", "scale", "rotY", "r", "width", "density"):
                if key in entry and not _finite(entry[key]):
                    errors.append(f"{path}: '{key}' is not finite")

            if bounds and "x" in entry and "z" in entry:
                if not (bounds["minX"] <= entry["x"] <= bounds["maxX"]
                        and bounds["minZ"] <= entry["z"] <= bounds["maxZ"]):
                    errors.append(f"{path}: ({entry['x']}, {entry['z']}) is outside the scene bounds")

    for group in ("districts", "routes", "props", "markers", "regions"):
        check(layout.get(group, []), group)

    if bounds:
        for route in layout.get("routes", []):
            for j, (x, z) in enumerate(route["points"]):
                if not (bounds["minX"] <= x <= bounds["maxX"]
                        and bounds["minZ"] <= z <= bounds["maxZ"]):
                    errors.append(f"routes ({route['id']}) point {j}: ({x}, {z}) is out of bounds")


# ── Entry point ─────────────────────────────────────────────────────────────

def build_layout(zone):
    """Harvest the open scene into a layout dict. Raises ExportError on any problem."""
    errors = []
    layout = {
        "version": LAYOUT_VERSION,
        "zone": zone,
        "bounds": _scene_bounds(errors),
        "districts": _harvest_districts(errors),
        "routes": _harvest_routes(errors),
        "props": _harvest_props(errors),
        "markers": _harvest_markers(errors),
        "regions": _harvest_regions(errors),
    }
    _validate(layout, errors)
    if errors:
        raise ExportError(
            f"{len(errors)} problem(s) — nothing written:\n  "
            + "\n  ".join(errors)
        )
    return layout


def export(zone, out):
    """Harvest, validate, and write the generated JS module."""
    layout = build_layout(zone)
    body = json.dumps(layout, indent=2, sort_keys=False)

    header = (
        "/**\n"
        f" * layout.generated.js — {zone}\n"
        " *\n"
        " * GENERATED by Assets/3D/BiomeWorlds/export_layout.py. Do not hand-edit:\n"
        " * the next export overwrites it. Change the .blend and re-export.\n"
        " *\n"
        " * Shape and validation rules: js/scene/layoutSchema.js\n"
        " */\n\n"
    )

    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as handle:
        handle.write(header)
        handle.write("export default ")
        handle.write(body)
        handle.write(";\n")

    counts = {k: len(layout.get(k, [])) for k in ("props", "routes", "markers", "regions", "districts")}
    print(f"[export_layout] wrote {out}")
    print(f"[export_layout] {counts}")
    print("[export_layout] now run `npm test` — the Node validator is authoritative")
    return layout
