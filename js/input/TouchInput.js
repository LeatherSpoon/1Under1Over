/**
 * TouchInput — virtual joystick + action button for mobile play,
 * plus mouse joystick support for desktop.
 *
 * The joystick zone (#joystick-zone) tracks any touch or mouse button
 * starting on the canvas. Moving the pointer translates to a normalized
 * dx/dz vector (clamped to radius).
 * Screen X  → world X   (left–right)
 * Screen Y↓ → world Z+  (matches ArrowDown / S key)
 *
 * #btn-mobile-action sets actionPressed while a finger is on it.
 */
export class TouchInput {
  constructor() {
    this.dx = 0;
    this.dz = 0;

    this._active = false;
    this._dragging = false;
    this._touchId = null;
    this._originX = 0;
    this._originY = 0;
    this._maxRadius = 52; // pixels
    this._dragThreshold = 10; // pixels
    this._actionHeld = false;
    this._actionPulse = false;

    this._stick = document.getElementById('joystick-stick');
    this._zone  = document.getElementById('joystick-zone');
    this._actionBtn = document.getElementById('btn-mobile-action');
    this._canvas = document.getElementById('game-canvas');

    this._hideJoystick();
    if (this._canvas)    this._initJoystick();
    if (this._canvas)    this._initMouseJoystick();
    if (this._actionBtn) this._initAction();
  }

  // ── Joystick (touch) ───────────────────────────────────────────────────────

  _initJoystick() {
    const target = this._canvas;

    target.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this._active) return;
      const t = e.changedTouches[0];
      if (this._isInteractiveTarget(t.target)) return;

      this._active  = true;
      this._dragging = false;
      this._touchId = t.identifier;
      this._originX = t.clientX;
      this._originY = t.clientY;
      this.dx = 0;
      this.dz = 0;
      this._positionJoystick(t.clientX, t.clientY);
      this._setStick(0, 0);
    }, { passive: false });

    target.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this._touchId) this._move(t.clientX, t.clientY);
      }
    }, { passive: false });

    const release = (e, shouldPulseAction) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._touchId) {
          if (shouldPulseAction && !this._dragging) {
            this._actionPulse = true;
          }
          this._active  = false;
          this._dragging = false;
          this._touchId = null;
          this.dx = 0;
          this.dz = 0;
          this._setStick(0, 0);
          this._hideJoystick();
        }
      }
    };
    target.addEventListener('touchend',    (e) => release(e, true), { passive: false });
    target.addEventListener('touchcancel', (e) => release(e, false), { passive: false });
  }

  // ── Mouse Joystick (desktop) ───────────────────────────────────────────────

  _initMouseJoystick() {
    const target = this._canvas;
    let _mouseDown = false;

    target.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (this._isInteractiveTarget(e.target)) return;
      if (this._active) return; // touch already active
      e.preventDefault();

      _mouseDown = true;
      this._active = true;
      this._dragging = false;
      this._originX = e.clientX;
      this._originY = e.clientY;
      this.dx = 0;
      this.dz = 0;
      this._positionJoystick(e.clientX, e.clientY);
      this._setStick(0, 0);
    });

    window.addEventListener('mousemove', (e) => {
      if (!_mouseDown || !this._active) return;
      this._move(e.clientX, e.clientY);
    });

    const release = () => {
      if (!_mouseDown) return;
      _mouseDown = false;
      if (!this._dragging) {
        this._actionPulse = true;
      }
      this._active = false;
      this._dragging = false;
      this.dx = 0;
      this.dz = 0;
      this._setStick(0, 0);
      this._hideJoystick();
    };

    window.addEventListener('mouseup', release);
  }

  _move(cx, cy) {
    const rawX = cx - this._originX;
    const rawY = cy - this._originY;
    const dist  = Math.sqrt(rawX * rawX + rawY * rawY);

    if (dist < this._dragThreshold && !this._dragging) {
      this.dx = 0;
      this.dz = 0;
      this._setStick(0, 0);
      return;
    }

    this._dragging = true;
    const clamp = Math.min(dist, this._maxRadius);
    const angle = Math.atan2(rawY, rawX);
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);

    this.dx = nx * (clamp / this._maxRadius);
    this.dz = ny * (clamp / this._maxRadius); // screen-down → world +Z
    this._setStick(nx * clamp, ny * clamp);
  }

  _setStick(ox, oy) {
    if (this._stick) {
      this._stick.style.transform =
        `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
    }
  }

  _positionJoystick(x, y) {
    if (!this._zone) return;
    this._zone.hidden = false;
    this._zone.style.left = `${x}px`;
    this._zone.style.top = `${y}px`;
  }

  _hideJoystick() {
    if (this._zone) this._zone.hidden = true;
  }

  _isInteractiveTarget(target) {
    if (!target?.closest) return false;
    return Boolean(target.closest([
      'button',
      'input',
      'select',
      'textarea',
      'a',
      '[role="button"]',
      '#hud [style*="pointer-events: auto"]',
      '.game-panel',
      '#inventory-panel',
      '#crafting-panel',
      '#drone-panel',
      '#ascension-panel',
      '#combat-overlay',
      '#mobile-controls'
    ].join(',')));
  }

  // ── Action button ──────────────────────────────────────────────────────────

  _initAction() {
    const btn = this._actionBtn;
    btn.addEventListener('touchstart',  (e) => { e.preventDefault(); this._actionHeld = true;  }, { passive: false });
    btn.addEventListener('touchend',    ()  => { this._actionHeld = false; });
    btn.addEventListener('touchcancel', ()  => { this._actionHeld = false; });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** True when joystick is pushed past the dead-zone. */
  get isMoving() {
    return Math.abs(this.dx) > 0.08 || Math.abs(this.dz) > 0.08;
  }

  get actionPressed() {
    return this._actionHeld || this._actionPulse;
  }

  consumeActionPulse() {
    if (!this._actionPulse) return false;
    this._actionPulse = false;
    return true;
  }

  /** Whether a touch / coarse pointer device is in use. */
  static get isMobile() {
    return window.matchMedia('(pointer: coarse)').matches;
  }
}
