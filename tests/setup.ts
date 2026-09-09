/*
 * Triggers - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

/* What the browser has and jsdom does not. The screen is measured by the drag
   library through these, and jsdom has no layout to report, so they exist to be
   called rather than to answer: a test asserts what the code decided, never
   where the browser put it. */

class Observer {
  observe(): void {
    /* Nothing is laid out, so nothing changes. */
  }

  unobserve(): void {
    /* Nothing to stop watching. */
  }

  disconnect(): void {
    /* Nothing to disconnect. */
  }

  takeRecords(): [] {
    return [];
  }
}

const shims: Record<string, unknown> = {
  ResizeObserver: Observer,
  IntersectionObserver: Observer,
};

for (const [name, value] of Object.entries(shims)) {
  if (!(name in window)) Object.defineProperty(window, name, { value, writable: true });
}

/* jsdom 30 implements PointerEvent but not pointer capture, and the drag library
   cancels a drag when `setPointerCapture` throws - so without these a drag can
   never start under test, however correct the code is. */
const capture = {
  setPointerCapture(): void {
    /* There is no compositor here to hand the pointer to. */
  },
  releasePointerCapture(): void {
    /* Nothing was captured. */
  },
  hasPointerCapture(): boolean {
    return false;
  },
};

for (const [name, value] of Object.entries(capture)) {
  if (!(name in Element.prototype)) {
    Object.defineProperty(Element.prototype, name, { value, writable: true, configurable: true });
  }
}

// jsdom has no hit testing; geometry and collision placement are checked in Obsidian.
if (!('elementFromPoint' in Document.prototype)) {
  Object.defineProperty(Document.prototype, 'elementFromPoint', {
    value: () => null,
    configurable: true,
  });
}

for (const prototype of [Document.prototype, Element.prototype]) {
  if (!('getAnimations' in prototype)) {
    Object.defineProperty(prototype, 'getAnimations', { value: () => [], configurable: true });
  }
}

// There are no rendered animation frames; completion still follows a promise.
if (!('animate' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'animate', {
    value: () => ({ finished: Promise.resolve() }),
    configurable: true,
  });
}

// No user media preferences exist in jsdom; retain the browser event-target API.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    value: (media: string) =>
      Object.assign(new EventTarget(), {
        media,
        matches: false,
        onchange: null,
        addListener(): void {
          /* Media preferences do not change in this environment. */
        },
        removeListener(): void {
          /* No preference observer was registered. */
        },
      }),
    configurable: true,
  });
}
