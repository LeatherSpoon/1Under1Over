# Floating Joystick Design

## Goal

Make mobile play viable with one hand by replacing the fixed lower-left joystick with a floating joystick, while making a short tap communicate action intent.

## Approved Interaction

Use the "tap implies intent, drag moves" model:

- A touch on the game canvas creates the joystick at that thumb location.
- Moving beyond a small threshold turns the touch into joystick movement.
- Ending the touch before that threshold sends one action pulse, equivalent to pressing `E` or tapping `ACT`.
- Existing UI controls, panels, combat actions, file inputs, and buttons keep their normal behavior and do not start the floating joystick.
- The existing `ACT` button remains available for deliberate gather/interact timing.

## Architecture

`TouchInput` owns the floating joystick state and exposes the same `dx`, `dz`, `isMoving`, and `actionPressed` interface already used by `Player` and `main.js`. The DOM remains responsible only for rendering the joystick base/stick and the explicit action button.

Mobile CSS no longer pins `#joystick-zone` to the lower-left. Instead, the zone becomes a hidden floating visual that `TouchInput` positions under the active touch.

## Testing

Add focused tests for `TouchInput` behavior using a minimal DOM/event shim:

- A canvas touch positions the joystick and dragging updates movement.
- A short tap produces a single action pulse.
- Taps on interactive UI are ignored by the floating joystick.
- The existing mobile action button still sets `actionPressed` while held.
