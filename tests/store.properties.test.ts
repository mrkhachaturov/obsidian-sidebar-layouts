/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type Arrangement, isLayout } from '../src/model';
import { type ReadonlyData, readData } from '../src/store';

/* `data.json` is edited by hand, merged by sync services and truncated by
 * crashes, so the parser's contract is total: any value in, usable settings out.
 *
 * Generated as valid data with one field replaced or removed, rather than as
 * random values: random values are rejected at the first field and never reach
 * the branches worth testing. Measured - a purely random generator produced a
 * readable button in 7 runs out of 1000. */

const broken = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  fc.integer(),
  fc.double(),
  fc.string({ maxLength: 6 }),
  fc.array(fc.anything(), { maxLength: 2 }),
  fc.dictionary(fc.string({ maxLength: 4 }), fc.anything(), { maxKeys: 2 }),
);

/** The same value with one key replaced by something else, or dropped. */
function damaged<T extends Record<string, unknown>>(
  arbitrary: fc.Arbitrary<T>,
): fc.Arbitrary<unknown> {
  return fc
    .tuple(arbitrary, fc.nat(), fc.oneof(broken, fc.constant(undefined)))
    .map(([value, index, replacement]) => {
      const keys = Object.keys(value);
      if (keys.length === 0) return value;
      const key = keys[index % keys.length] as string;
      const copy: Record<string, unknown> = { ...value };
      if (replacement === undefined) delete copy[key];
      else copy[key] = replacement;
      return copy;
    });
}

const identifier = fc.constantFrom('a', 'b', 'c');
const viewType = fc.constantFrom('tag', 'backlink', 'outline', 'file-explorer', 'search');
const dimension = fc.double({ min: 1, max: 99, noNaN: true });

const validArrangement = fc.record(
  {
    home: fc.oneof(viewType, fc.constant(null)),
    homeDimension: dimension,
    floors: fc.array(fc.record({ view: viewType, dimension }, { requiredKeys: ['view'] }), {
      maxLength: 3,
    }),
  },
  { requiredKeys: ['home', 'floors'] },
);

const common = {
  id: identifier,
  side: fc.constantFrom('left', 'right'),
  placement: fc.constantFrom('header', 'panel'),
  showWhenCollapsed: fc.boolean(),
  visible: fc.boolean(),
  name: fc.string({ maxLength: 8 }),
  icon: fc.constantFrom('tag', 'layout-panel-left', 'terminal'),
};

const validLayout = fc.record(
  {
    ...common,
    kind: fc.constant('layout'),
    saved: validArrangement,
    working: validArrangement,
    fullWidthNotes: fc.boolean(),
    registerCommand: fc.boolean(),
  },
  { requiredKeys: ['id', 'side', 'placement', 'kind', 'saved'] },
);

const validCommand = fc.record(
  {
    ...common,
    kind: fc.constant('command'),
    commandId: fc.constantFrom('app:open-settings', 'global-search:open'),
  },
  { requiredKeys: ['id', 'side', 'placement', 'kind', 'commandId'] },
);

const validButton = fc.oneof(validLayout, validCommand);

const button = fc.oneof(
  { arbitrary: validButton, weight: 6 },
  { arbitrary: damaged(validButton), weight: 5 },
  { arbitrary: broken, weight: 1 },
);

/** Ids of the layouts a generated list actually holds, so governing can name one. */
function layoutIds(buttons: readonly unknown[], side: string): string[] {
  return buttons.flatMap((entry) => {
    if (entry === null || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const id = record.id;
    return record.kind === 'layout' && record.side === side && typeof id === 'string' ? [id] : [];
  });
}

const validData = fc.array(button, { maxLength: 5 }).chain((buttons) =>
  fc.record(
    {
      buttons: fc.constant(buttons),
      governing: fc.record({
        left: fc.oneof(fc.constantFrom(...layoutIds(buttons, 'left'), null), identifier),
        right: fc.oneof(fc.constantFrom(...layoutIds(buttons, 'right'), null), identifier),
      }),
      hideManagedTabs: fc.boolean(),
      showTooltips: fc.boolean(),
    },
    { requiredKeys: ['buttons'] },
  ),
);

const stored = fc.oneof(
  { arbitrary: validData, weight: 6 },
  { arbitrary: damaged(validData), weight: 3 },
  { arbitrary: fc.anything(), weight: 1 },
);

function checkArrangement(shape: Arrangement): void {
  expect(shape.home === null || typeof shape.home === 'string').toBe(true);
  for (const value of [shape.homeDimension, ...shape.floors.map((floor) => floor.dimension)]) {
    if (value === undefined) continue;
    expect(Number.isFinite(value)).toBe(true);
    expect(value > 0 && value <= 100).toBe(true);
  }
  for (const floor of shape.floors) expect(floor.view.length).toBeGreaterThan(0);
}

/** Everything the rest of the plugin is allowed to assume about loaded data. */
function checkData(data: ReadonlyData): void {
  expect(typeof data.hideManagedTabs).toBe('boolean');
  expect(typeof data.showTooltips).toBe('boolean');

  const seen = new Set<string>();
  for (const entry of data.buttons) {
    expect(entry.id.length).toBeGreaterThan(0);
    expect(seen.has(entry.id)).toBe(false);
    seen.add(entry.id);
    expect(['left', 'right']).toContain(entry.side);
    expect(['header', 'panel']).toContain(entry.placement);
    expect(typeof entry.showWhenCollapsed).toBe('boolean');
    expect(typeof entry.visible).toBe('boolean');
    expect(typeof entry.name).toBe('string');
    expect(entry.icon.length).toBeGreaterThan(0);
    if (isLayout(entry)) {
      checkArrangement(entry.saved);
      if (entry.working !== undefined) checkArrangement(entry.working);
    } else expect(entry.commandId.length).toBeGreaterThan(0);
  }

  /* A governing id names a layout in that sidebar, or nothing at all: anything
   * else would leave a button highlighted for a layout that cannot be applied. */
  for (const side of ['left', 'right'] as const) {
    const id = data.governing[side];
    if (id === null) continue;
    const owner = data.buttons.find((entry) => entry.id === id);
    expect(owner !== undefined && isLayout(owner) && owner.side === side).toBe(true);
  }
}

describe('reading stored settings', () => {
  it('answers with usable settings whatever the file holds', () => {
    fc.assert(
      fc.property(stored, (raw) => {
        checkData(readData(raw));
      }),
      { numRuns: 1000 },
    );
  });

  it('reads back what it would write, unchanged', () => {
    fc.assert(
      fc.property(stored, (raw) => {
        const once = readData(raw);
        /* The store saves this object, so parsing it again has to be a fixed
         * point - otherwise an ordinary save would keep rewriting the file. */
        expect(readData(JSON.parse(JSON.stringify(once)))).toEqual(once);
      }),
      { numRuns: 1000 },
    );
  });

  /* The control for the two properties above: an empty run and a run that never
   * built a button look identical from the outside. */
  it('generates data that reaches the parser, not only data it rejects', () => {
    const reached = { buttons: 0, layouts: 0, governing: 0, working: 0 };
    const runs = 500;
    fc.assert(
      fc.property(stored, (raw) => {
        const data = readData(raw);
        if (data.buttons.length > 0) reached.buttons += 1;
        if (data.buttons.some(isLayout)) reached.layouts += 1;
        if (data.governing.left !== null || data.governing.right !== null) reached.governing += 1;
        if (data.buttons.some((entry) => isLayout(entry) && entry.working !== undefined))
          reached.working += 1;
      }),
      { numRuns: runs, seed: 1, endOnFailure: true },
    );
    expect(reached.buttons).toBeGreaterThan(runs / 4);
    expect(reached.layouts).toBeGreaterThan(runs / 5);
    expect(reached.governing).toBeGreaterThan(runs / 10);
    expect(reached.working).toBeGreaterThan(runs / 10);
  });
});
