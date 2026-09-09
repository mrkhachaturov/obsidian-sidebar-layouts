import { describe, expect, it } from 'vitest';
import {
  type Arrangement,
  arrangementOf,
  type Button,
  declaredPanels,
  isModified,
  type LayoutButton,
  moveInList,
  newId,
  panelsOf,
  sameArrangement,
} from '../src/model';

function shape(home: string | null, floors: string[]): Arrangement {
  return { home, floors: floors.map((view) => ({ view })) };
}

function layout(id: string, saved: Arrangement, working?: Arrangement): LayoutButton {
  const base = {
    kind: 'layout' as const,
    id,
    side: 'right' as const,
    placement: 'header' as const,
    showWhenCollapsed: false,
    name: id,
    icon: 'x',
    visible: true,
    saved,
    fullWidthNotes: false,
    registerCommand: true,
  };
  return working === undefined ? base : { ...base, working };
}

const command: Button = {
  kind: 'command',
  id: 'c1',
  side: 'left',
  placement: 'header',
  showWhenCollapsed: false,
  name: 'Toggle theme',
  icon: 'sun',
  visible: true,
  commandId: 'theme:toggle-light-dark',
};

describe('panelsOf', () => {
  it('lists the top panel first, then the floors', () => {
    expect(panelsOf(shape('file-properties', ['backlink', 'outgoing-link']))).toEqual([
      'file-properties',
      'backlink',
      'outgoing-link',
    ]);
  });

  it('omits an absent top panel', () => {
    expect(panelsOf(shape(null, ['backlink']))).toEqual(['backlink']);
  });
});

describe('arrangementOf', () => {
  it('shows the working shape when there is one', () => {
    const entry = layout('a', shape('tag', []), shape('outline', ['backlink']));
    expect(arrangementOf(entry).home).toBe('outline');
    expect(isModified(entry)).toBe(true);
  });

  it('falls back to the saved shape', () => {
    const entry = layout('a', shape('tag', []));
    expect(arrangementOf(entry).home).toBe('tag');
    expect(isModified(entry)).toBe(false);
  });
});

describe('declaredPanels', () => {
  it('covers both the saved and the working shape', () => {
    const buttons = [layout('a', shape('tag', ['backlink']), shape('outline', [])), command];
    expect([...declaredPanels(buttons)].sort()).toEqual(['backlink', 'outline', 'tag']);
  });

  it('ignores command buttons, which declare no panels', () => {
    expect([...declaredPanels([command])]).toEqual([]);
  });
});

describe('sameArrangement', () => {
  it('ignores the fractions a drag lands on', () => {
    const a: Arrangement = { home: 'tag', homeDimension: 61.0004, floors: [] };
    const b: Arrangement = { home: 'tag', homeDimension: 61.4, floors: [] };
    expect(sameArrangement(a, b)).toBe(true);
  });

  it('sees a different panel', () => {
    expect(sameArrangement(shape('tag', []), shape('outline', []))).toBe(false);
  });

  it('sees a floor that was added', () => {
    expect(sameArrangement(shape('tag', []), shape('tag', ['backlink']))).toBe(false);
  });

  it('treats an absent height as agreeing, since it means "whatever is left"', () => {
    const saved: Arrangement = { home: 'tag', floors: [{ view: 'backlink', dimension: 38.7 }] };
    const live: Arrangement = {
      home: 'tag',
      homeDimension: 61.3,
      floors: [{ view: 'backlink', dimension: 38.7 }],
    };
    expect(sameArrangement(saved, live)).toBe(true);
  });

  it('sees a height that actually moved', () => {
    const a: Arrangement = { home: 'tag', floors: [{ view: 'backlink', dimension: 30 }] };
    const b: Arrangement = { home: 'tag', floors: [{ view: 'backlink', dimension: 70 }] };
    expect(sameArrangement(a, b)).toBe(false);
  });
});

describe('moveInList', () => {
  const ids = (list: { id: string }[]): string[] => list.map((entry) => entry.id);

  it('moves an entry down', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    moveInList(list, 'a', 1);
    expect(ids(list)).toEqual(['b', 'a', 'c']);
  });

  it('does nothing at the edges', () => {
    const list = [{ id: 'a' }, { id: 'b' }];
    moveInList(list, 'a', -1);
    moveInList(list, 'b', 1);
    expect(ids(list)).toEqual(['a', 'b']);
  });

  it('does nothing for an unknown id', () => {
    const list = [{ id: 'a' }];
    moveInList(list, 'zzz', 1);
    expect(ids(list)).toEqual(['a']);
  });
});

describe('newId', () => {
  it('never repeats, so a macro holding one keeps meaning the same layout', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
  });
});
