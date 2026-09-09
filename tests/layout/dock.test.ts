import { describe, expect, it } from 'vitest';
import { applyArrangement } from '../../src/layout/apply';
import { captureSidebar } from '../../src/layout/capture';
import { leafOfView, readDock } from '../../src/layout/dock';
import { FakeWorkspace } from '../helpers/workspace';

describe('readDock', () => {
  it('matches identical groups by serialized IDs even when live iteration is reversed', () => {
    const workspace = new FakeWorkspace([
      { types: ['markdown', 'backlink'], revealed: 1, dimension: 60 },
      { types: ['markdown', 'backlink'], revealed: 0, dimension: 40 },
    ]);
    workspace.reverseIteration = true;
    const groups = readDock(workspace.app);
    expect(groups.map((group) => group.parent)).toEqual(workspace.groups);
    expect(groups[0]?.leaves).toEqual(workspace.groups[0]?.children);
    expect(groups[0]?.revealedLeaf).toBe(workspace.leaf(0, 1));
    expect(groups[1]?.revealedLeaf).toBe(workspace.leaf(1));
    expect(captureSidebar(workspace.app)).toEqual({
      home: 'backlink',
      homeDimension: 60,
      floors: [{ view: 'markdown', dimension: 40 }],
    });
  });

  it('finds leaves using serialized order instead of live enumeration order', () => {
    const workspace = new FakeWorkspace([{ types: ['tag', 'outline'] }]);
    workspace.reverseIteration = true;
    const group = readDock(workspace.app)[0];
    expect(group).toBeDefined();
    if (group === undefined) return;
    expect(leafOfView(group, 'outline')).toBe(workspace.leaf(0, 1));
    expect(leafOfView(group, 'unknown')).toBeNull();
  });

  it.each([
    null,
    { children: {} },
    { children: [{ type: 'split', id: 'nested', children: [] }] },
    { children: [{ type: 'tabs', id: 'group-0', children: 'bad' }] },
    {
      children: [
        { type: 'tabs', id: 'group-0', children: [{ type: 'leaf', id: 'leaf-1', state: null }] },
      ],
    },
    {
      children: [
        {
          type: 'tabs',
          id: 'group-0',
          currentTab: 0.5,
          children: [{ type: 'leaf', id: 'leaf-1', state: { type: 'tag' } }],
        },
      ],
    },
    {
      children: [
        {
          type: 'tabs',
          id: 'group-0',
          dimension: '20',
          children: [{ type: 'leaf', id: 'leaf-1', state: { type: 'tag' } }],
        },
      ],
    },
  ])('rejects a malformed or unsupported serialized tree without throwing: %j', (right) => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }]);
    // getLayout is replaceable independently from the fake's live tree.
    workspace.getLayout = () => ({ right });
    expect(readDock(workspace.app)).toEqual([]);
  });

  it('rejects the complete snapshot if one live leaf is missing from serialization', async () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }, { types: ['chat'] }]);
    const tree = workspace.getLayout().right as { children: unknown[] };
    tree.children.pop();
    workspace.layoutOverride = () => tree;
    expect(readDock(workspace.app)).toEqual([]);
    expect(await applyArrangement(workspace.app, { home: 'tag', floors: [] })).toBe(false);
    expect(workspace.groups).toHaveLength(2);
    expect(workspace.leaves.every((leaf) => leaf.detaches === 0)).toBe(true);
  });

  it('rejects duplicate leaf IDs instead of associating them with an arbitrary group', () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }, { types: ['tag'] }]);
    Object.defineProperty(workspace.leaf(1), 'id', { value: workspace.leaf(0).id });
    expect(readDock(workspace.app)).toEqual([]);
  });

  it('rejects a serialized leaf assigned to the wrong live parent', () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }, { types: ['chat'] }]);
    const tree = workspace.getLayout().right as { children: { id: string }[] };
    const first = tree.children[0];
    if (first === undefined) throw new Error('Expected group');
    first.id = 'different-parent';
    workspace.layoutOverride = () => tree;
    expect(readDock(workspace.app)).toEqual([]);
  });
});

describe.each(['left', 'right'] as const)('readDock on %s', (side) => {
  it('reads only the selected live tree even when both sides have the same view types', () => {
    const specs = [{ types: ['tag', 'markdown'], revealed: 1 }, { types: ['chat'] }];
    const workspace = new FakeWorkspace(specs, specs);
    workspace.reverseIteration = true;
    const groups = readDock(workspace.app, side);
    expect(groups.map((group) => group.parent)).toEqual(workspace.groupsFor(side));
    expect(groups.flatMap((group) => group.leaves)).toEqual(workspace.leavesFor(side));
    expect(captureSidebar(workspace.app, side)).toEqual({
      home: 'markdown',
      floors: [{ view: 'chat' }],
    });
  });

  it('rejects a serialized tree referencing the opposite side', () => {
    const specs = [{ types: ['tag'] }];
    const workspace = new FakeWorkspace(specs, specs);
    const other = side === 'left' ? 'right' : 'left';
    const tree = workspace.getLayout()[other];
    if (side === 'left') workspace.leftLayoutOverride = () => tree;
    else workspace.layoutOverride = () => tree;
    expect(readDock(workspace.app, side)).toEqual([]);
    expect(readDock(workspace.app, other)).toHaveLength(1);
  });

  it('ignores malformed IDs in the opposite sidebar', () => {
    const specs = [{ types: ['tag', 'chat'] }];
    const workspace = new FakeWorkspace(specs, specs);
    const other = side === 'left' ? 'right' : 'left';
    Object.defineProperty(workspace.leaf(0, 1, other), 'id', {
      value: workspace.leaf(0, 0, other).id,
    });
    expect(readDock(workspace.app, side)).toHaveLength(1);
    expect(readDock(workspace.app, other)).toEqual([]);
  });
});
