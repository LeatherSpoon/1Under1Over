# The Generation Engine — evolving player computer (design)

**Date:** 2026-08-01 · **Status:** approved direction, this round is the visual arc + evolve/customize loop only.

## What it is

The physical embodiment of the persistence fiction (`Plans/The computer is the persistence mechanism.txt`): the machine that stores the player's backups, growing across 24 generations from a salvaged home PC to a skyscraper-scale megastructure. It stands at the **Landing Site and grows in place forever** — it never relocates; instead, at mid-arc the player gains the ability to walk **inside** it.

## Core loop

1. **Eligibility:** reaching a set number of Recompile generations makes the computer eligible for its next evolution (thresholds tuned later; the system reads `ascension.prestigeCount`).
2. **Schematic quest:** the machine's panel shows the next generation's schematic — a delivery checklist of materials/crafted components (Terraria-altar style, reusing the existing recipe/material economy; the Training-console recipe pattern). The player feeds it over time.
3. **Evolution:** when fully fed, the player triggers the evolution at the machine. Shape module variants for the new generation are chosen here and locked until the next evolution.
4. **Color:** the kit ships with **color variations** (runtime toon-material tints — case tint + accent glow, no per-color textures). What colors *mean* — when they can change, what they signify, any rules around them — is **deliberately unspecified**; the owner dictates that later. This round only builds the capability and the variation set.

## The 24-generation arc — 5 eras

Each era is one **structure type** with a fixed, predictable silhouette envelope (the "cone"); generations within an era add mass and swap modules (the "flavors" — Baskin-Robbins principle: many combinations, all recognizably the same structure).

| Era | Gens | Scale (units) | Silhouette | Generation beats |
|---|---|---|---|---|
| 1 The Desk | 1–4 | 0.5–1.5 | desk clutter | salvaged beige PC on a crate → dual-tower cable tangle → open-frame workbench rig → full-height server pillar |
| 2 The Rack | 5–8 | 2–3.5 | rack/container | rack row + AC unit → U-shaped rack pod, raised floor → container data pod, heat fins → stacked twin containers, first exterior glow lines |
| 3 The Building | 9–13 | 4–8 | low structure | data shed (**first walk-in — door unlocks**) → data hall + cooling towers → two-story server block → cooling campus (radiators, coolant pipes) → first vertical core tower |
| 4 The Tower | 14–18 | 10–18 | vertical mass | mainframe spire → tiered ziggurat → twin-core + sky-bridge → heat-column tower (convection glow) → seamless monolith, glyph trace-lines |
| 5 The Megastructure | 19–24 | 20–34 | skyline/backdrop | segmented stack-scraper → buttressed arcology core → orbital-uplink spire → world-computer facade → portal-caster (orbiting ring crown) → the Continuum Engine (animated energy spine) |

Ortho-camera rule: at Era 4–5 scale, the base is the interactive object at y≈0; the upper mass reads as backdrop, the mountain convention.

## Module slots (the flavors)

Per era, ~4 slots, each with 2–4 interchangeable variants:

- **Crown** — what tops the structure (fan array / dish / antenna / ring…)
- **Facade** — panel & vent pattern
- **Cooling** — fins / dishes / pipes / radiators
- **Glow circuit** — LED/trace-line pattern

Variants never change the envelope — combinations are predictable within the structure type.

## Asset strategy

One modular **ComputerKit per era** (MineKit convention: `.blend` source in `Assets/3D/ComputerKit/` with embedded export scripts → GLBs in `models/`). Clean case/rack/panel geometry is procedural Blender (Rodin is weak at hard-surface boxes); sculptural pieces (arcology buttresses, ring crown, monolith) go through the headless Rodin pipeline. All pieces tint-friendly (materials named for the runtime re-shade; glow materials follow the /glow/ naming rule).

Runtime: a `ComputerSystem` (serializes generation / chosen slot variants / color selection; SaveSystem convention) + a data table mapping generation → envelope + slot placements; the Landing Site zone builder assembles the current generation from the kit (station-model late-attach conventions). Walk-in interior is a door zone (HomeInteriors template) with a placeholder room this round.

## In scope this round

- The 5 era kits (Blender/Rodin), all 24 generation assemblies, slot-variant pieces, color variation capability
- ComputerSystem (state + save), schematic delivery checklist panel, evolution trigger, slot-variant choice at evolution
- Landing Site placement + growth, walk-in door from Era 3, placeholder interior

## Explicit future hooks (NOT this round)

- **Color semantics** — owner-dictated later; this round ships variations only, no rules about them
- **Recompile terminal relocates into the computer** (rebirth happens at the machine that stores you)
- **Mechanical bonuses per generation** (cap, offline buffer, compute…)
- **Interior purposes** — the "various reasons" the player ventures inside
- Eligibility threshold tuning (needs balance pass against real recompile pacing)
