import { describe, expect, it, vi } from 'vitest';
import {
  applyArrangement,
  reconcileFloors,
  restoreArrangementFloors,
} from '../../src/layout/apply';
import { captureSidebar } from '../../src/layout/capture';
import type { Arrangement } from '../../src/model';
import { FakeWorkspace } from '../helpers/workspace';

const last = <T>(values: readonly T[]): T | undefined => values[values.length - 1];

const shape = (home: string, ...floors: string[]): Arrangement => ({
  home,
  floors: floors.map((view) => ({ view })),
});

describe('applyArrangement', () => {
  it('preserves all existing leaves and state, including unrelated lower tabs', async () => {
    const workspace = new FakeWorkspace([
      { types: ['tag'] },
      { types: ['backlink', 'markdown'] },
      { types: ['chat'] },
    ]);
    const original = workspace.leaves;
    const note = workspace.leaf(1, 1);
    const chat = workspace.leaf(2);
    const draft = { draft: 'Unsent message', scroll: 123 };
    chat.state = draft;
    note.state = { file: 'Other.md', mode: 'source' };

    expect(await applyArrangement(workspace.app, shape('tag', 'backlink'))).toBe(true);
    expect(captureSidebar(workspace.app)).toEqual(shape('tag', 'backlink'));
    expect(new Set(workspace.leaves)).toEqual(new Set(original));
    expect(chat.state).toBe(draft);
    expect(note.state.file).toBe('Other.md');
    expect(note.parent).toBe(workspace.groups[0]);
    expect(chat.parent).toBe(workspace.groups[0]);
    expect(original.every((leaf) => leaf.detaches === 0 && leaf.setCalls === 0)).toBe(true);
  });

  it('reuses a home leaf moved into a lower group', async () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }, { types: ['outline', 'markdown'] }]);
    const home = workspace.leaf(1);
    const original = workspace.leaves;
    expect(await applyArrangement(workspace.app, shape('outline'))).toBe(true);
    expect(last(workspace.revealed)).toBe(home);
    expect(workspace.groups).toHaveLength(1);
    expect(new Set(workspace.leaves)).toEqual(new Set(original));
    expect(original.every((leaf) => leaf.detaches === 0)).toBe(true);
  });

  it('creates a missing home in the right dock without replacing its other tabs', async () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }, { types: ['backlink'] }]);
    const original = workspace.leaves;
    expect(await applyArrangement(workspace.app, shape('outline'))).toBe(true);
    expect(captureSidebar(workspace.app).home).toBe('outline');
    expect(original.every((leaf) => workspace.leaves.includes(leaf) && leaf.detaches === 0)).toBe(
      true,
    );
  });

  it('restores an empty dock and supplies the active file only to new views', async () => {
    const workspace = new FakeWorkspace([]);
    expect(await applyArrangement(workspace.app, shape('outline', 'backlink'))).toBe(true);
    expect(captureSidebar(workspace.app)).toEqual(shape('outline', 'backlink'));
    expect(workspace.leaves.every((leaf) => leaf.state.file === 'Active.md')).toBe(true);
  });

  it('does not move or reinitialize matching floors on repeated application', async () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }, { types: ['backlink', 'markdown'] }]);
    const groups = workspace.groups;
    const original = workspace.leaves;
    expect(await applyArrangement(workspace.app, shape('tag', 'backlink'))).toBe(true);
    expect(await applyArrangement(workspace.app, shape('tag', 'backlink'))).toBe(true);
    expect(workspace.groups).toEqual(groups);
    expect(workspace.allCreated).toEqual(original);
    expect(original.every((leaf) => leaf.detaches === 0 && leaf.setCalls === 0)).toBe(true);
  });

  it('preserves the currently shown instance when several top leaves have the same type', async () => {
    const workspace = new FakeWorkspace([{ types: ['markdown', 'markdown'], revealed: 1 }]);
    const home = workspace.leaf(0, 1);
    expect(await applyArrangement(workspace.app, shape('markdown'))).toBe(true);
    expect(last(workspace.revealed)).toBe(home);
  });

  it('assigns separate existing leaves to repeated floor types', async () => {
    const workspace = new FakeWorkspace([{ types: ['tag', 'backlink', 'backlink'] }]);
    const backlinks = workspace.leaves.slice(1);
    expect(await applyArrangement(workspace.app, shape('tag', 'backlink', 'backlink'))).toBe(true);
    expect(workspace.leaf(1)).toBe(backlinks[0]);
    expect(workspace.leaf(2)).toBe(backlinks[1]);
    expect(backlinks.every((leaf) => leaf.setCalls === 0)).toBe(true);
  });

  it('preflights every missing view before changing any existing group', async () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }, { types: ['chat'] }]);
    const before = workspace.getLayout();
    expect(await applyArrangement(workspace.app, shape('outline', 'not-installed'))).toBe(false);
    expect(workspace.getLayout()).toEqual(before);
    expect(workspace.allCreated).toHaveLength(2);
  });

  it('refuses creation if the view registry capability is unavailable', async () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }]);
    const app = workspace.app;
    delete app.viewRegistry;
    expect(await applyArrangement(app, shape('outline'))).toBe(false);
    expect(workspace.allCreated).toHaveLength(1);
  });

  it('refuses an unavailable parent movement API before any mutation', async () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }, { types: ['chat'] }]);
    const before = workspace.getLayout();
    Object.defineProperty(workspace.groups[1], 'removeChild', { value: undefined });
    expect(await applyArrangement(workspace.app, shape('tag'))).toBe(false);
    expect(workspace.getLayout()).toEqual(before);
  });

  it('refuses a drawer/unknown host instead of treating it as a desktop split', async () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }]);
    Object.setPrototypeOf(workspace.rightSplit, Object.prototype);
    expect(await applyArrangement(workspace.app, shape('outline'))).toBe(false);
    expect(workspace.allCreated).toHaveLength(1);
  });

  it('cleans only a newly created empty leaf when initialization rejects', async () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }, { types: ['chat'] }]);
    const original = workspace.leaves;
    const before = workspace.getLayout();
    workspace.beforeInitialize = async () => {
      throw new Error('Cannot initialize');
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await applyArrangement(workspace.app, shape('outline', 'backlink'))).toBe(false);
      expect(workspace.getLayout()).toEqual(before);
      expect(original.every((leaf) => leaf.detaches === 0)).toBe(true);
      expect(last(workspace.allCreated)?.detaches).toBe(1);
    } finally {
      error.mockRestore();
    }
  });

  it('keeps a newly initialized view attached if its async initialization later rejects', async () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }, { types: ['chat'] }]);
    workspace.afterInitialize = async (leaf) => {
      leaf.state = { draft: 'Text entered while loading' };
      throw new Error('Late failure');
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await applyArrangement(workspace.app, shape('outline'))).toBe(false);
      const created = last(workspace.allCreated);
      expect(created?.getRoot()).toBe(workspace.rightSplit);
      expect(created?.detaches).toBe(0);
      expect(created?.state.draft).toBe('Text entered while loading');
    } finally {
      error.mockRestore();
    }
  });

  it('allocates all destination groups before moving any existing leaves', async () => {
    const workspace = new FakeWorkspace([
      { types: ['tag', 'backlink', 'outline'] },
      { types: ['chat'] },
    ]);
    const before = workspace.getLayout();
    const original = workspace.leaves;
    let allocations = 0;
    workspace.allowAllocation = (split) => !split || ++allocations < 2;
    expect(await applyArrangement(workspace.app, shape('tag', 'backlink', 'outline'))).toBe(false);
    expect(workspace.getLayout()).toEqual(before);
    expect(original.every((leaf) => leaf.detaches === 0)).toBe(true);
  });

  it('does nothing when cancelled before starting', async () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }, { types: ['chat'] }]);
    const before = workspace.getLayout();
    expect(await applyArrangement(workspace.app, shape('outline'), () => true)).toBe(false);
    expect(workspace.getLayout()).toEqual(before);
  });

  it('stops after cancellation during initialization and leaves existing groups untouched', async () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }, { types: ['chat'] }]);
    const groups = workspace.groups;
    const chat = workspace.leaf(1);
    let cancelled = false;
    workspace.afterInitialize = async () => {
      cancelled = true;
    };
    expect(
      await applyArrangement(workspace.app, shape('outline', 'backlink'), () => cancelled),
    ).toBe(false);
    expect(workspace.groups).toEqual(groups);
    expect(chat.parent).toBe(groups[1]);
    expect(chat.detaches).toBe(0);
    expect(workspace.revealed).toHaveLength(0);
    expect(workspace.allCreated).toHaveLength(3);
  });

  it('reports cancellation during reveal without applying heights', async () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }, { types: ['backlink'] }]);
    let cancelled = false;
    workspace.beforeReveal = async () => {
      cancelled = true;
    };
    expect(
      await applyArrangement(
        workspace.app,
        {
          home: 'tag',
          homeDimension: 70,
          floors: [{ view: 'backlink', dimension: 30 }],
        },
        () => cancelled,
      ),
    ).toBe(false);
    expect(workspace.rightSplit.recomputes).toBe(0);
  });

  it('does not report success or resize a different tree opened during async reveal', async () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }, { types: ['backlink'] }]);
    workspace.beforeReveal = async () => {
      const note = workspace.getRightLeaf(true);
      if (note !== null) note.type = 'markdown';
    };
    expect(
      await applyArrangement(workspace.app, {
        home: 'tag',
        homeDimension: 70,
        floors: [{ view: 'backlink', dimension: 30 }],
      }),
    ).toBe(false);
    expect(workspace.rightSplit.recomputes).toBe(0);
    expect(workspace.groups).toHaveLength(3);
    expect(workspace.leaf(2).type).toBe('markdown');
  });

  it('does not rearrange a tree the user changed during async view preparation', async () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }, { types: ['chat'] }]);
    const chat = workspace.leaf(1);
    workspace.afterInitialize = async () => {
      chat.parent?.removeChild(chat);
      workspace.groups[0]?.insertChild(-1, chat);
    };
    expect(await applyArrangement(workspace.app, shape('outline', 'backlink'))).toBe(false);
    expect(chat.parent).toBe(workspace.groups[0]);
    expect(chat.detaches).toBe(0);
    expect(workspace.revealed).toHaveLength(0);
  });

  it.each([
    { home: 'outline', homeDimension: 80, floors: [{ view: 'backlink', dimension: 40 }] },
    { home: 'outline', floors: [{ view: 'backlink', dimension: -1 }] },
    { home: 'outline', floors: [{ view: 'backlink', dimension: Number.NaN }] },
    {
      home: 'outline',
      floors: [
        { view: 'backlink', dimension: 60 },
        { view: 'chat', dimension: 60 },
      ],
    },
  ])('rejects invalid dimensions before moving or creating leaves: %j', async (target) => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }, { types: ['chat'] }]);
    const before = workspace.getLayout();
    expect(await applyArrangement(workspace.app, target)).toBe(false);
    expect(workspace.getLayout()).toEqual(before);
    expect(workspace.allCreated).toHaveLength(2);
  });

  it('refuses unsupported height mutation before rearranging leaves', async () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }]);
    Object.defineProperty(workspace.rightSplit, 'recomputeChildrenDimensions', {
      value: undefined,
    });
    expect(
      await applyArrangement(workspace.app, {
        home: 'outline',
        floors: [{ view: 'backlink', dimension: 30 }],
      }),
    ).toBe(false);
    expect(workspace.allCreated).toHaveLength(1);
  });
});

describe('temporary note floors', () => {
  it('parks and restores the same views with their saved heights', async () => {
    const workspace = new FakeWorkspace([
      { types: ['tag', 'markdown'], revealed: 1, dimension: 70 },
      { types: ['chat'], dimension: 30 },
    ]);
    const note = workspace.leaf(0, 1);
    const chat = workspace.leaf(1);
    const state = { draft: 'Keep me', scroll: 5 };
    chat.state = state;
    expect(await reconcileFloors(workspace.app, [])).toBe(true);
    expect(workspace.groups).toHaveLength(1);
    expect(last(workspace.revealed)).toBe(note);
    expect(chat.detaches).toBe(0);

    await workspace.revealLeaf(workspace.leaf(0));
    expect(
      await restoreArrangementFloors(workspace.app, {
        home: 'tag',
        homeDimension: 70,
        floors: [{ view: 'chat', dimension: 30 }],
      }),
    ).toBe(true);
    expect(workspace.leaf(1)).toBe(chat);
    expect(chat.state).toBe(state);
    expect(chat.setCalls).toBe(0);
    expect(workspace.groups.map((group) => group.dimension)).toEqual([70, 30]);
  });

  it('preserves the shown top note when restoring floors after disabling the option', async () => {
    const workspace = new FakeWorkspace([{ types: ['tag', 'markdown', 'chat'], revealed: 1 }]);
    const note = workspace.leaf(0, 1);
    expect(await restoreArrangementFloors(workspace.app, shape('tag', 'chat'))).toBe(true);
    expect(last(workspace.revealed)).toBe(note);
    expect(captureSidebar(workspace.app).home).toBe('markdown');
  });
});

describe.each(['left', 'right'] as const)('%s sidebar isolation', (side) => {
  const other = side === 'left' ? 'right' : 'left';

  it('reuses only this side’s identical view types and restores only its heights', async () => {
    const specs = [
      { types: ['tag', 'outline'], dimension: 60 },
      { types: ['chat', 'markdown'], revealed: 1, dimension: 40 },
    ];
    const workspace = new FakeWorkspace(specs, specs);
    const untouched = workspace.getLayout()[other];
    const otherLeaves = workspace.leavesFor(other);
    const original = workspace.leavesFor(side);
    const chat = workspace.leaf(1, 0, side);
    const note = workspace.leaf(1, 1, side);
    const draft = { draft: 'Keep the draft' };
    chat.state = draft;
    const target = {
      home: 'outline',
      homeDimension: 75,
      floors: [{ view: 'chat', dimension: 25 }],
    };

    expect(await applyArrangement(workspace.app, target, undefined, side)).toBe(true);
    expect(captureSidebar(workspace.app, side)).toEqual(target);
    expect(new Set(workspace.leavesFor(side))).toEqual(new Set(original));
    expect(workspace.leaf(1, 0, side)).toBe(chat);
    expect(chat.state).toBe(draft);
    expect(note.parent).toBe(workspace.groupsFor(side)[0]);
    expect(workspace.getLayout()[other]).toEqual(untouched);
    expect(workspace.leavesFor(other)).toEqual(otherLeaves);
    expect(
      [...original, ...otherLeaves].every((leaf) => leaf.detaches === 0 && leaf.setCalls === 0),
    ).toBe(true);
    expect((side === 'left' ? workspace.leftSplit : workspace.rightSplit).recomputes).toBe(1);
    expect((other === 'left' ? workspace.leftSplit : workspace.rightSplit).recomputes).toBe(0);
  });

  it('creates missing panels on this side even when matching panels exist opposite', async () => {
    const workspace = new FakeWorkspace(
      [{ types: ['outline', 'backlink'] }],
      [{ types: ['outline', 'backlink'] }],
    );
    for (const leaf of workspace.leavesFor(side)) leaf.detach();
    const untouched = workspace.getLayout()[other];
    const otherLeaves = workspace.leavesFor(other);
    expect(
      await applyArrangement(workspace.app, shape('outline', 'backlink'), undefined, side),
    ).toBe(true);
    expect(captureSidebar(workspace.app, side)).toEqual(shape('outline', 'backlink'));
    expect(
      workspace
        .leavesFor(side)
        .every((leaf) => leaf.setCalls === 1 && leaf.state.file === 'Active.md'),
    ).toBe(true);
    expect(workspace.getLayout()[other]).toEqual(untouched);
    expect(otherLeaves.every((leaf) => leaf.detaches === 0 && leaf.setCalls === 0)).toBe(true);
  });

  it('refuses an unavailable panel even when its view exists on the other side', async () => {
    const workspace = new FakeWorkspace(
      [{ types: ['tag', 'not-installed'] }],
      [{ types: ['tag', 'not-installed'] }],
    );
    workspace.leaf(0, 1, side).detach();
    const before = workspace.getLayout();
    expect(await applyArrangement(workspace.app, shape('not-installed'), undefined, side)).toBe(
      false,
    );
    expect(workspace.getLayout()).toEqual(before);
  });

  it('parks and restores only this side’s floors while retaining the shown note', async () => {
    const specs = [{ types: ['tag', 'markdown'], revealed: 1 }, { types: ['chat'] }];
    const workspace = new FakeWorkspace(specs, specs);
    const untouched = workspace.getLayout()[other];
    const chat = workspace.leaf(1, 0, side);
    expect(await reconcileFloors(workspace.app, [], undefined, side)).toBe(true);
    expect(workspace.groupsFor(side)).toHaveLength(1);
    expect(
      await restoreArrangementFloors(workspace.app, shape('tag', 'chat'), undefined, side),
    ).toBe(true);
    expect(captureSidebar(workspace.app, side)).toEqual(shape('markdown', 'chat'));
    expect(workspace.leaf(1, 0, side)).toBe(chat);
    expect(workspace.getLayout()[other]).toEqual(untouched);
  });

  it('stops on cancellation during initialization without moving either side’s existing leaves', async () => {
    const specs = [{ types: ['tag'] }, { types: ['chat'] }];
    const workspace = new FakeWorkspace(specs, specs);
    const untouched = workspace.getLayout()[other];
    const groups = workspace.groupsFor(side);
    const existing = workspace.leavesFor(side);
    let cancelled = false;
    workspace.afterInitialize = async () => {
      cancelled = true;
    };
    expect(
      await applyArrangement(workspace.app, shape('outline', 'backlink'), () => cancelled, side),
    ).toBe(false);
    expect(workspace.groupsFor(side)).toEqual(groups);
    expect(existing.every((leaf) => leaf.detaches === 0 && leaf.setCalls === 0)).toBe(true);
    expect(workspace.getLayout()[other]).toEqual(untouched);
    expect(workspace.revealed).toHaveLength(0);
  });

  it('refuses a prepared leaf moved across sides while initialization awaited', async () => {
    const specs = [{ types: ['tag'] }, { types: ['chat'] }];
    const workspace = new FakeWorkspace(specs, specs);
    const original = workspace.groupsFor(side);
    workspace.afterInitialize = async (leaf) => {
      leaf.parent?.removeChild(leaf);
      workspace.groupsFor(other)[0]?.insertChild(-1, leaf);
    };
    expect(await applyArrangement(workspace.app, shape('outline'), undefined, side)).toBe(false);
    expect(workspace.groupsFor(side)).toEqual(original);
    const moved = last(workspace.allCreated);
    expect(moved?.getRoot()).toBe(other === 'left' ? workspace.leftSplit : workspace.rightSplit);
    expect(moved?.detaches).toBe(0);
    expect(workspace.revealed).toHaveLength(0);
  });

  it('leaves an empty placeholder moved to the opposite side intact on initialization failure', async () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }], [{ types: ['tag'] }]);
    workspace.beforeInitialize = async (leaf) => {
      leaf.parent?.removeChild(leaf);
      workspace.groupsFor(other)[0]?.insertChild(-1, leaf);
      throw new Error('Initialization failed after moving the leaf');
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await applyArrangement(workspace.app, shape('outline'), undefined, side)).toBe(false);
      expect(last(workspace.allCreated)?.detaches).toBe(0);
      expect(last(workspace.allCreated)?.getRoot()).toBe(
        other === 'left' ? workspace.leftSplit : workspace.rightSplit,
      );
    } finally {
      error.mockRestore();
    }
  });

  it('does not resize either side when reveal is cancelled', async () => {
    const specs = [
      { types: ['tag'], dimension: 60 },
      { types: ['chat'], dimension: 40 },
    ];
    const workspace = new FakeWorkspace(specs, specs);
    const untouched = workspace.getLayout()[other];
    let cancelled = false;
    workspace.beforeReveal = async () => {
      cancelled = true;
    };
    expect(
      await applyArrangement(
        workspace.app,
        {
          home: 'tag',
          homeDimension: 75,
          floors: [{ view: 'chat', dimension: 25 }],
        },
        () => cancelled,
        side,
      ),
    ).toBe(false);
    expect(workspace.leftSplit.recomputes).toBe(0);
    expect(workspace.rightSplit.recomputes).toBe(0);
    expect(workspace.getLayout()[other]).toEqual(untouched);
  });
});
