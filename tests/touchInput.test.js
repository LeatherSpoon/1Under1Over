import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TouchInput } from '../js/input/TouchInput.js';

class FakeElement {
  constructor(id, tagName = 'div') {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.style = {};
    this.listeners = {};
    this.parentElement = null;
    this.hidden = false;
    this.disabled = false;
    this.classList = {
      contains: () => false
    };
  }

  addEventListener(type, handler) {
    this.listeners[type] ??= [];
    this.listeners[type].push(handler);
  }

  dispatch(type, event) {
    for (const handler of this.listeners[type] ?? []) {
      handler(event);
    }
  }

  getBoundingClientRect() {
    return { left: 100, top: 100, width: 130, height: 130 };
  }

  closest(selector) {
    if (selector.includes(this.tagName.toLowerCase()) || selector.includes(this.tagName)) {
      return this;
    }
    if (this.parentElement) return this.parentElement.closest(selector);
    return null;
  }
}

function touch(identifier, clientX, clientY, target = null) {
  return { identifier, clientX, clientY, target };
}

function touchEvent(touches) {
  return {
    changedTouches: touches,
    preventDefaultCalled: false,
    preventDefault() {
      this.preventDefaultCalled = true;
    }
  };
}

function setupDom() {
  const elements = {
    'game-canvas': new FakeElement('game-canvas', 'canvas'),
    'joystick-zone': new FakeElement('joystick-zone'),
    'joystick-stick': new FakeElement('joystick-stick'),
    'btn-mobile-action': new FakeElement('btn-mobile-action', 'button'),
    'panel-buttons': new FakeElement('panel-buttons')
  };

  global.document = {
    getElementById(id) {
      return elements[id] ?? null;
    }
  };

  global.window = {
    addEventListener() {},
    removeEventListener() {},
    matchMedia() {
      return { matches: true };
    }
  };

  return elements;
}

test('canvas touch positions floating joystick and drag updates movement', () => {
  const elements = setupDom();
  const input = new TouchInput();

  elements['game-canvas'].dispatch('touchstart', touchEvent([
    touch(1, 220, 300, elements['game-canvas'])
  ]));

  assert.equal(elements['joystick-zone'].style.left, '220px');
  assert.equal(elements['joystick-zone'].style.top, '300px');
  assert.equal(elements['joystick-zone'].hidden, false);

  elements['game-canvas'].dispatch('touchmove', touchEvent([
    touch(1, 272, 300, elements['game-canvas'])
  ]));

  assert.equal(input.isMoving, true);
  assert.equal(input.dx, 1);
  assert.equal(input.dz, 0);
});

test('floating joystick visual starts hidden before the first touch', () => {
  const elements = setupDom();

  new TouchInput();

  assert.equal(elements['joystick-zone'].hidden, true);
});

test('short canvas tap emits one action pulse without movement', () => {
  const elements = setupDom();
  const input = new TouchInput();

  elements['game-canvas'].dispatch('touchstart', touchEvent([
    touch(1, 240, 320, elements['game-canvas'])
  ]));
  elements['game-canvas'].dispatch('touchend', touchEvent([
    touch(1, 242, 321, elements['game-canvas'])
  ]));

  assert.equal(input.isMoving, false);
  assert.equal(input.actionPressed, true);
  assert.equal(input.consumeActionPulse(), true);
  assert.equal(input.actionPressed, false);
  assert.equal(input.consumeActionPulse(), false);
  assert.equal(elements['joystick-zone'].hidden, true);
});

test('cancelled canvas touch does not emit an action pulse', () => {
  const elements = setupDom();
  const input = new TouchInput();

  elements['game-canvas'].dispatch('touchstart', touchEvent([
    touch(1, 240, 320, elements['game-canvas'])
  ]));
  elements['game-canvas'].dispatch('touchcancel', touchEvent([
    touch(1, 240, 320, elements['game-canvas'])
  ]));

  assert.equal(input.actionPressed, false);
  assert.equal(input.consumeActionPulse(), false);
  assert.equal(elements['joystick-zone'].hidden, true);
});

test('touches that start on interactive UI do not create a floating joystick', () => {
  const elements = setupDom();
  const input = new TouchInput();

  elements['game-canvas'].dispatch('touchstart', touchEvent([
    touch(1, 20, 20, elements['btn-mobile-action'])
  ]));

  assert.equal(input.isMoving, false);
  assert.equal(input.actionPressed, false);
  assert.equal(elements['joystick-zone'].style.left, undefined);
});

test('mobile action button still holds actionPressed while touched', () => {
  const elements = setupDom();
  const input = new TouchInput();

  elements['btn-mobile-action'].dispatch('touchstart', touchEvent([
    touch(1, 10, 10, elements['btn-mobile-action'])
  ]));

  assert.equal(input.actionPressed, true);

  elements['btn-mobile-action'].dispatch('touchend', touchEvent([
    touch(1, 10, 10, elements['btn-mobile-action'])
  ]));

  assert.equal(input.actionPressed, false);
});
