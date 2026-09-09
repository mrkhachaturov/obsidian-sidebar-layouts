import { type App, type WorkspaceLeaf, WorkspaceSidedock } from 'obsidian';
import type { SidebarSide } from '../../src/model';

type ViewState = { type: string; active?: boolean; state?: Record<string, unknown> };
type Item = FakeLeaf | FakeParent;

export interface GroupSpec {
  types: string[];
  revealed?: number;
  dimension?: number;
}

/** Model the inspected host's identity-preserving parent operations. */
export class FakeParent {
  readonly id: string;
  parent: FakeParent | null = null;
  children: Item[] = [];
  currentTab = 0;
  dimension: number | null | undefined;
  recomputes = 0;
  failInsert = false;

  constructor(id: string) {
    this.id = id;
  }

  getRoot = (): Item => this.parent?.getRoot() ?? this;

  insertChild = (index: number, child: Item): void => {
    if (this.failInsert) throw new Error('Insertion refused');
    const at = index < 0 || index >= this.children.length ? this.children.length : index;
    this.children.splice(at, 0, child);
    child.parent = this;
  };

  removeChild = (child: Item): void => {
    const shown = this.children[this.currentTab];
    const at = this.children.indexOf(child);
    if (at < 0) throw new Error('Child is not attached');
    this.children.splice(at, 1);
    child.parent = null;
    if (this.children.length === 0 && this.parent !== null) this.parent.removeChild(this);
    this.currentTab =
      shown === child
        ? Math.min(at, this.children.length - 1)
        : this.children.indexOf(shown as Item);
    if (this.currentTab < 0) this.currentTab = 0;
  };

  recomputeChildrenDimensions = (): void => {
    this.recomputes += 1;
  };
}

export class FakeLeaf {
  readonly id: string;
  parent: FakeParent | null = null;
  type: string;
  state: Record<string, unknown> = {};
  detaches = 0;
  setCalls = 0;
  readonly workspace: FakeWorkspace;
  readonly view = {
    getViewType: (): string => this.type,
    getState: (): Record<string, unknown> => this.state,
  };

  constructor(workspace: FakeWorkspace, id: string, type: string) {
    this.workspace = workspace;
    this.id = id;
    this.type = type;
  }

  getRoot = (): Item => this.parent?.getRoot() ?? this;

  setViewState = async (state: ViewState): Promise<void> => {
    this.setCalls += 1;
    await this.workspace.beforeInitialize?.(this, state);
    this.type = state.type;
    this.state = state.state ?? {};
    await this.workspace.afterInitialize?.(this, state);
  };

  detach = (): void => {
    this.detaches += 1;
    this.parent?.removeChild(this);
    this.type = 'empty';
  };
}

export class FakeWorkspace {
  readonly rightSplit = new FakeParent('right');
  readonly leftSplit = new FakeParent('left');
  readonly allCreated: FakeLeaf[] = [];
  readonly registered = new Set([
    'tag',
    'outline',
    'backlink',
    'markdown',
    'chat',
    'outgoing-link',
  ]);
  readonly revealed: FakeLeaf[] = [];
  activeFile: string | null = 'Active.md';
  reverseIteration = false;
  beforeInitialize?: (leaf: FakeLeaf, state: ViewState) => Promise<void>;
  afterInitialize?: (leaf: FakeLeaf, state: ViewState) => Promise<void>;
  beforeReveal?: (leaf: FakeLeaf) => Promise<void>;
  allowAllocation?: (split: boolean, side: SidebarSide) => boolean;
  layoutOverride?: () => unknown;
  leftLayoutOverride?: () => unknown;
  private sequence = 0;

  constructor(groups: GroupSpec[], leftGroups: GroupSpec[] = []) {
    // Only instanceof uses the real host class. Methods are own properties so
    // this remains a deterministic fake without invoking a host constructor.
    Object.setPrototypeOf(this.rightSplit, WorkspaceSidedock.prototype);
    Object.setPrototypeOf(this.leftSplit, WorkspaceSidedock.prototype);
    for (const side of ['right', 'left'] as const) {
      for (const spec of side === 'right' ? groups : leftGroups) {
        const parent = this.newGroup(side);
        parent.dimension = spec.dimension;
        for (const type of spec.types) parent.insertChild(-1, this.newLeaf(type));
        parent.currentTab = spec.revealed ?? 0;
      }
    }
  }

  get app(): App {
    return {
      workspace: this,
      viewRegistry: {
        getViewCreatorByType: (type: string) =>
          this.registered.has(type) ? () => undefined : undefined,
      },
    } as unknown as App;
  }

  get groups(): FakeParent[] {
    return this.groupsFor('right');
  }

  get leaves(): FakeLeaf[] {
    return this.leavesFor('right');
  }

  groupsFor(side: SidebarSide): FakeParent[] {
    return (side === 'left' ? this.leftSplit : this.rightSplit).children as FakeParent[];
  }

  leavesFor(side: SidebarSide): FakeLeaf[] {
    return this.groupsFor(side).flatMap((group) => group.children as FakeLeaf[]);
  }

  leaf(group: number, index = 0, side: SidebarSide = 'right'): FakeLeaf {
    const leaf = this.groupsFor(side)[group]?.children[index];
    if (!(leaf instanceof FakeLeaf)) throw new Error('Leaf does not exist');
    return leaf;
  }

  private newGroup(side: SidebarSide): FakeParent {
    const group = new FakeParent(`group-${this.sequence++}`);
    (side === 'left' ? this.leftSplit : this.rightSplit).insertChild(-1, group);
    return group;
  }

  private newLeaf(type: string): FakeLeaf {
    const leaf = new FakeLeaf(this, `leaf-${this.sequence++}`, type);
    this.allCreated.push(leaf);
    return leaf;
  }

  private serializeSide(side: SidebarSide): Record<string, unknown> {
    return {
      id: side,
      type: 'split',
      children: this.groupsFor(side).map((group) => ({
        id: group.id,
        type: 'tabs',
        currentTab: group.currentTab,
        ...(group.dimension === undefined || group.dimension === null
          ? {}
          : { dimension: group.dimension }),
        children: group.children.map((item) => {
          const leaf = item as FakeLeaf;
          return { id: leaf.id, type: 'leaf', state: { type: leaf.type, state: leaf.state } };
        }),
      })),
    };
  }

  getLayout = (): Record<string, unknown> => ({
    right: this.layoutOverride?.() ?? this.serializeSide('right'),
    left: this.leftLayoutOverride?.() ?? this.serializeSide('left'),
  });

  iterateAllLeaves = (callback: (leaf: WorkspaceLeaf) => void): void => {
    const leaves = [...this.leavesFor('right'), ...this.leavesFor('left')];
    if (this.reverseIteration) leaves.reverse();
    for (const leaf of leaves) callback(leaf as unknown as WorkspaceLeaf);
  };

  getActiveFile = (): { path: string } | null =>
    this.activeFile === null ? null : { path: this.activeFile };

  getRightLeaf = (split: boolean): FakeLeaf | null => this.allocateLeaf(split, 'right');

  getLeftLeaf = (split: boolean): FakeLeaf | null => this.allocateLeaf(split, 'left');

  private allocateLeaf(split: boolean, side: SidebarSide): FakeLeaf | null {
    if (this.allowAllocation?.(split, side) === false) return null;
    const groups = this.groupsFor(side);
    const group = split || groups.length === 0 ? this.newGroup(side) : groups[0];
    if (group === undefined) return null;
    const leaf = this.newLeaf('empty');
    group.insertChild(-1, leaf);
    return leaf;
  }

  revealLeaf = async (leaf: FakeLeaf): Promise<void> => {
    await this.beforeReveal?.(leaf);
    if (leaf.parent === null) throw new Error('Cannot reveal a detached leaf');
    leaf.parent.currentTab = leaf.parent.children.indexOf(leaf);
    this.revealed.push(leaf);
  };
}
