import type { WorkspaceLeaf, WorkspaceParent } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { applyHeights, moveLeaf, mutableParent } from '../../src/layout/host';
import { FakeWorkspace } from '../helpers/workspace';

describe('guarded host movement adapter', () => {
  it('restores a removed source group and its leaf when insertion fails', () => {
    const workspace = new FakeWorkspace([{ types: ['tag'] }, { types: ['chat'] }]);
    const groups = workspace.groups;
    const source = workspace.leaf(1);
    const originalView = source.view;
    const target = workspace.groups[0];
    if (target === undefined) throw new Error('Expected target');
    target.failInsert = true;
    const adapter = mutableParent(target as unknown as WorkspaceParent);
    if (adapter === null) throw new Error('Expected adapter');
    expect(() => moveLeaf(source as unknown as WorkspaceLeaf, adapter)).toThrow(
      'Insertion refused',
    );
    expect(workspace.groups).toEqual(groups);
    expect(source.parent).toBe(groups[1]);
    expect(source.view).toBe(originalView);
    expect(source.detaches).toBe(0);
  });

  it('treats movement within the same parent as a no-op', () => {
    const workspace = new FakeWorkspace([{ types: ['tag', 'chat'] }]);
    const group = workspace.groups[0];
    const adapter = mutableParent(group as unknown as WorkspaceParent);
    if (adapter === null) throw new Error('Expected adapter');
    const before = workspace.getLayout();
    moveLeaf(workspace.leaf(0, 1) as unknown as WorkspaceLeaf, adapter);
    expect(workspace.getLayout()).toEqual(before);
    expect(workspace.leaf(0, 1).detaches).toBe(0);
  });

  it('restores dimension fields and reports failure if host recomputation throws', () => {
    const workspace = new FakeWorkspace([
      { types: ['tag'], dimension: 60 },
      { types: ['chat'], dimension: 40 },
    ]);
    workspace.rightSplit.recomputeChildrenDimensions = () => {
      throw new Error('Host failed');
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(
        applyHeights(workspace.app, {
          home: 'tag',
          homeDimension: 70,
          floors: [{ view: 'chat', dimension: 30 }],
        }),
      ).toBe(false);
      expect(workspace.groups.map((group) => group.dimension)).toEqual([60, 40]);
    } finally {
      error.mockRestore();
    }
  });
});

describe.each(['left', 'right'] as const)('height adapter on %s', (side) => {
  it('restores only the selected dimensions when recomputation fails', () => {
    const specs = [
      { types: ['tag'], dimension: 60 },
      { types: ['chat'], dimension: 40 },
    ];
    const workspace = new FakeWorkspace(specs, specs);
    const other = side === 'left' ? 'right' : 'left';
    const untouched = workspace.getLayout()[other];
    const split = side === 'left' ? workspace.leftSplit : workspace.rightSplit;
    split.recomputeChildrenDimensions = () => {
      throw new Error('Host failed');
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(
        applyHeights(
          workspace.app,
          {
            home: 'tag',
            homeDimension: 75,
            floors: [{ view: 'chat', dimension: 25 }],
          },
          side,
        ),
      ).toBe(false);
      expect(workspace.groupsFor(side).map((group) => group.dimension)).toEqual([60, 40]);
      expect(workspace.getLayout()[other]).toEqual(untouched);
    } finally {
      error.mockRestore();
    }
  });
});
