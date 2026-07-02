# Floating Joystick Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed mobile joystick with a floating joystick where short taps trigger action intent and drags control movement.

**Architecture:** Keep the existing `TouchInput` public interface so `Player` and `main.js` continue using `dx`, `dz`, `isMoving`, and `actionPressed`. Add event handling on the game canvas for floating joystick start/move/end, and use CSS only for the floating visual presentation.

**Tech Stack:** Plain JavaScript ES modules, DOM touch events, CSS media queries, Node test runner through `npm test`.

---

### Task 1: TouchInput Regression Tests

**Files:**
- Create: `tests/touchInput.test.js`
- Modify: `package.json`

- [ ] Add tests proving floating joystick placement, drag movement, tap action pulse, UI-ignore behavior, and existing ACT button hold behavior.
- [ ] Run `npm test` and verify the new tests fail because `TouchInput` currently only listens to the fixed joystick zone.

### Task 2: Floating Joystick Behavior

**Files:**
- Modify: `js/input/TouchInput.js`

- [ ] Listen for touch starts on `#game-canvas`.
- [ ] Ignore touches that begin on interactive UI.
- [ ] Position `#joystick-zone` at the touch origin and reveal it.
- [ ] Treat movement past a drag threshold as joystick movement.
- [ ] Treat a release before the threshold as a one-frame action pulse.
- [ ] Keep the existing action button behavior.

### Task 3: Mobile CSS

**Files:**
- Modify: `css/mobile.css`

- [ ] Convert `#joystick-zone` from fixed lower-left placement to a floating hidden control.
- [ ] Keep joystick base and stick dimensions consistent across portrait and landscape.
- [ ] Leave panel buttons and the ACT button usable.

### Task 4: Verification

**Files:**
- Read: `docs/superpowers/specs/2026-04-18-floating-joystick-design.md`

- [ ] Run `npm test`.
- [ ] Run a syntax import check for `js/input/TouchInput.js`.
- [ ] Re-read the approved design and verify every requirement is covered.
