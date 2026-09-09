import type { App, Plugin } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Controller } from '../../src/controller';
import { captureSidebar } from '../../src/layout/capture';
import { readDock } from '../../src/layout/dock';
import type { Arrangement, LayoutButton, PluginData } from '../../src/model';
import { readData, Store } from '../../src/store';
import { removeManagedTabStyle } from '../../src/ui/managedTabs';
import { FakeWorkspace } from '../helpers/workspace';

// Workspace and persistence run together. Rendering and its observer have their
// own DOM contracts; replacing them keeps this suite focused on host operations.
vi.mock('../../src/ui/buttons', () => ({
  sidebarDocument: () => document,
  ButtonRow: class {
    start(): void {}
    sync(): void {}
  },
}));
vi.mock('../../src/ui/topTabWatcher', () => ({ watchTopTab: vi.fn() }));

type Registration = { event: string; listener: () => void };

class WorkflowWorkspace extends FakeWorkspace {
  private readonly listeners = new Map<string, Set<() => void>>();

  on = (event: string, listener: () => void): Registration => {
    const listeners = this.listeners.get(event) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return { event, listener };
  };

  offref = ({ event, listener }: Registration): void => {
    this.listeners.get(event)?.delete(listener);
  };

  onLayoutReady = (callback: () => void): void => callback();

  emit(event: string): void {
    for (const listener of this.listeners.get(event) ?? []) listener();
  }
}

function layout(id: string, saved: Arrangement): LayoutButton {
  return {
    id,
    kind: 'layout',
    side: 'right',
    placement: 'header',
    showWhenCollapsed: false,
    name: id,
    icon: 'layout-panel-right',
    visible: true,
    fullWidthNotes: false,
    registerCommand: true,
    saved,
  };
}

class WorkflowPlugin {
  readonly manifest = { id: 'sidebar-layouts' };
  readonly snapshots: PluginData[] = [];
  readonly addCommand = vi.fn();
  readonly app: App;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly workspace: WorkflowWorkspace,
    private readonly initial: PluginData,
  ) {
    this.app = workspace.app;
  }

  loadData = async (): Promise<unknown> => structuredClone(this.initial);

  saveData = vi.fn(async (data: unknown): Promise<void> => {
    this.snapshots.push(readData(structuredClone(data)));
  });

  register = (cleanup: () => void): void => {
    this.cleanups.push(cleanup);
  };

  registerEvent = (registration: Registration): void => {
    this.register(() => this.workspace.offref(registration));
  };

  unload(): void {
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
  }
}

async function fixture() {
  const workspace = new WorkflowWorkspace([
    { types: ['chat', 'tag'], dimension: 60 },
    { types: ['backlink'], dimension: 40 },
  ]);
  const chat = workspace.leaf(0);
  const draft = { draft: 'An unsent message', thread: { id: 'conversation-1' } };
  chat.state = draft;
  const backlink = workspace.leaf(1);
  backlink.state = { file: 'Active.md', expanded: ['incoming-1'] };
  const originalLeaves = [...workspace.leaves];
  const captured = captureSidebar(workspace.app);
  const initial = readData({
    buttons: [
      layout('A', captured),
      layout('B', { home: 'tag', homeDimension: 65, floors: [{ view: 'outline', dimension: 35 }] }),
    ],
    governing: { left: null, right: 'A' },
  });
  const plugin = new WorkflowPlugin(workspace, initial);
  // This boundary supplies only the host lifecycle and persistence methods used
  // by these services. Their domain objects remain real and compiler-checked.
  const host = plugin as unknown as Plugin;
  const store = new Store(host);
  await store.load();
  const controller = new Controller(host, store);
  controller.start();
  return { workspace, plugin, store, controller, chat, draft, backlink, originalLeaves, captured };
}

function resize(workspace: WorkflowWorkspace, top: number, bottom: number): void {
  const home = workspace.groups[0];
  const floor = workspace.groups[1];
  if (home === undefined || floor === undefined) throw new Error('Expected two live groups');
  home.dimension = top;
  floor.dimension = bottom;
  workspace.emit('resize');
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  removeManagedTabStyle(document);
});

describe('Controller, persistence, and live workspace composition', () => {
  it('preserves live panels and flushes a working resize through a complete A/B round trip', async () => {
    const f = await fixture();
    expect(f.captured).toEqual({
      home: 'chat',
      homeDimension: 60,
      floors: [{ view: 'backlink', dimension: 40 }],
    });

    await f.controller.apply('B');
    const outline = f.workspace.leaf(1);
    expect(outline.type).toBe('outline');
    expect(f.workspace.groups.map((group) => group.dimension)).toEqual([65, 35]);
    expect(f.store.current.governing.right).toBe('B');

    resize(f.workspace, 55, 45);
    // No timer has fired: apply must record B before replacing its live geometry.
    await f.controller.apply('A');
    expect(f.plugin.snapshots.map((data) => data.governing.right)).toEqual(['B', 'B', 'A']);
    expect(f.plugin.snapshots[1]?.buttons[1]).toMatchObject({
      id: 'B',
      saved: { homeDimension: 65, floors: [{ dimension: 35 }] },
      working: { homeDimension: 55, floors: [{ dimension: 45 }] },
    });
    expect(captureSidebar(f.workspace.app)).toEqual(f.captured);
    expect(f.workspace.leaf(1)).toBe(f.backlink);

    await f.controller.apply('B');
    expect(f.workspace.leaf(1)).toBe(outline);
    expect(f.workspace.groups.map((group) => group.dimension)).toEqual([55, 45]);
    expect(f.store.current.governing.right).toBe('B');
    expect(f.chat.state).toBe(f.draft);
    expect(f.chat.state).toEqual({ draft: 'An unsent message', thread: { id: 'conversation-1' } });
    for (const leaf of f.originalLeaves) {
      expect(f.workspace.leaves).toContain(leaf);
      expect(leaf.detaches).toBe(0);
      expect(leaf.setCalls).toBe(0);
    }
    expect(f.workspace.activeFile).toBe('Active.md');

    resize(f.workspace, 50, 50);
    const writes = f.plugin.saveData.mock.calls.length;
    const shapeAtStop = captureSidebar(f.workspace.app);
    f.controller.stop();
    f.plugin.unload();
    f.workspace.emit('resize');
    await vi.advanceTimersByTimeAsync(1000);
    await f.controller.apply('A');
    expect(f.plugin.saveData).toHaveBeenCalledTimes(writes);
    expect(captureSidebar(f.workspace.app)).toEqual(shapeAtStop);
    expect(f.store.current.governing.right).toBe('B');
  });

  it('keeps the displayed layout intact when flushing its resize fails, then retries the full switch', async () => {
    const f = await fixture();
    await f.controller.apply('B');
    resize(f.workspace, 52, 48);
    const liveGroups = [...f.workspace.groups];
    const liveLeaves = [...f.workspace.leaves];
    const allocation = vi.spyOn(f.workspace, 'getRightLeaf');
    f.plugin.saveData.mockRejectedValueOnce(new Error('Storage temporarily unavailable'));

    await f.controller.apply('A');
    expect(f.store.current.governing.right).toBe('B');
    expect(f.store.find('B')).not.toHaveProperty('working');
    expect(allocation).not.toHaveBeenCalled();
    expect(f.workspace.groups).toHaveLength(liveGroups.length);
    liveGroups.forEach((group, index) => {
      expect(f.workspace.groups[index]).toBe(group);
    });
    expect(f.workspace.leaves).toHaveLength(liveLeaves.length);
    liveLeaves.forEach((leaf, index) => {
      expect(f.workspace.leaves[index]).toBe(leaf);
    });
    expect(readDock(f.workspace.app).map((group) => group.revealed)).toEqual(['tag', 'outline']);

    await f.controller.apply('A');
    expect(f.store.current.governing.right).toBe('A');
    expect(f.store.find('B')).toMatchObject({
      working: { homeDimension: 52, floors: [{ dimension: 48 }] },
    });
    expect(f.plugin.snapshots.map((data) => data.governing.right)).toEqual(['B', 'B', 'A']);
    await f.controller.apply('B');
    expect(f.workspace.groups.map((group) => group.dimension)).toEqual([52, 48]);
    expect(f.chat.state).toBe(f.draft);
    expect(f.chat.detaches).toBe(0);
    f.controller.stop();
    f.plugin.unload();
  });
  it('stops a real asynchronous view preparation without closing existing views or persisting a switch', async () => {
    const f = await fixture();
    let enter: () => void = () => undefined;
    let release: () => void = () => undefined;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.workspace.beforeInitialize = async () => {
      enter();
      await paused;
    };

    const applying = f.controller.apply('B');
    await entered;
    expect(f.workspace.leaves.map((leaf) => leaf.type)).toContain('empty');
    f.controller.stop();
    f.plugin.unload();
    release();
    await applying;

    expect(f.plugin.saveData).not.toHaveBeenCalled();
    expect(f.store.current.governing.right).toBe('A');
    expect(captureSidebar(f.workspace.app)).toEqual(f.captured);
    for (const leaf of f.originalLeaves) {
      expect(f.workspace.leaves).toContain(leaf);
      expect(leaf.detaches).toBe(0);
      expect(leaf.setCalls).toBe(0);
    }
    expect(f.chat.state).toBe(f.draft);
    const stoppedLayout = f.workspace.getLayout();
    await f.controller.apply('B');
    expect(f.workspace.getLayout()).toEqual(stoppedLayout);
  });
});

it('keeps real left and right layouts, working geometry, and live leaf state independent', async () => {
  const workspace = new WorkflowWorkspace(
    [
      { types: ['tag'], dimension: 60 },
      { types: ['backlink'], dimension: 40 },
    ],
    [
      { types: ['file-explorer'], dimension: 70 },
      { types: ['search'], dimension: 30 },
    ],
  );
  for (const view of ['file-explorer', 'search', 'bookmarks']) workspace.registered.add(view);
  const leftLeaf = workspace.leaf(0, 0, 'left');
  const rightLeaf = workspace.leaf(0);
  leftLeaf.state = { selectedFolder: 'Projects' };
  rightLeaf.state = { filter: '#active' };
  const leftState = leftLeaf.state;
  const rightState = rightLeaf.state;
  const initial = readData({
    buttons: [
      layout('R1', captureSidebar(workspace.app, 'right')),
      layout('R2', {
        home: 'tag',
        homeDimension: 55,
        floors: [{ view: 'outline', dimension: 45 }],
      }),
      { ...layout('L1', captureSidebar(workspace.app, 'left')), side: 'left' },
      {
        ...layout('L2', {
          home: 'file-explorer',
          homeDimension: 65,
          floors: [{ view: 'bookmarks', dimension: 35 }],
        }),
        side: 'left',
      },
    ],
    governing: { left: 'L1', right: 'R1' },
  });
  const plugin = new WorkflowPlugin(workspace, initial);
  const store = new Store(plugin as unknown as Plugin);
  await store.load();
  const left = new Controller(plugin as unknown as Plugin, store, 'left');
  const right = new Controller(plugin as unknown as Plugin, store, 'right');
  left.start();
  right.start();
  await Promise.all([left.apply('L2'), right.apply('R2')]);
  expect(store.current.governing).toEqual({ left: 'L2', right: 'R2' });
  expect(captureSidebar(workspace.app, 'left').floors[0]?.view).toBe('bookmarks');
  expect(captureSidebar(workspace.app, 'right').floors[0]?.view).toBe('outline');
  const leftGroups = workspace.groupsFor('left');
  const leftHome = leftGroups[0];
  const leftFloor = leftGroups[1];
  if (leftHome === undefined || leftFloor === undefined) throw new Error('Expected left groups');
  leftHome.dimension = 48;
  leftFloor.dimension = 52;
  workspace.emit('resize');
  await vi.advanceTimersByTimeAsync(701);
  expect(store.find('L2')).toMatchObject({
    working: { homeDimension: 48, floors: [{ dimension: 52 }] },
  });
  expect(store.find('R2')).not.toHaveProperty('working');
  const rightBefore = captureSidebar(workspace.app, 'right');
  await left.apply('L1');
  expect(captureSidebar(workspace.app, 'right')).toEqual(rightBefore);
  expect(store.current.governing).toEqual({ left: 'L1', right: 'R2' });
  await left.apply('L2');
  expect(captureSidebar(workspace.app, 'left').homeDimension).toBe(48);
  expect(leftLeaf.state).toBe(leftState);
  expect(rightLeaf.state).toBe(rightState);
  expect(leftLeaf.detaches + rightLeaf.detaches).toBe(0);
  left.stop();
  right.stop();
  plugin.unload();
});

it('records an opposite-side resize while a busy sidebar waits to reveal its intermediate layout', async () => {
  const workspace = new WorkflowWorkspace(
    [
      { types: ['chat'], dimension: 60 },
      { types: ['backlink'], dimension: 40 },
    ],
    [
      { types: ['tag'], dimension: 70 },
      { types: ['backlink'], dimension: 30 },
    ],
  );
  const originalLeft = captureSidebar(workspace.app, 'left');
  const nextLeft: Arrangement = {
    home: 'tag',
    homeDimension: 65,
    floors: [{ view: 'outline', dimension: 35 }],
  };
  const initial = readData({
    buttons: [
      layout('R1', captureSidebar(workspace.app, 'right')),
      { ...layout('L1', originalLeft), side: 'left' },
      { ...layout('L2', nextLeft), side: 'left' },
    ],
    governing: { left: 'L1', right: 'R1' },
  });
  const plugin = new WorkflowPlugin(workspace, initial);
  const store = new Store(plugin as unknown as Plugin);
  await store.load();
  const left = new Controller(plugin as unknown as Plugin, store, 'left');
  const right = new Controller(plugin as unknown as Plugin, store, 'right');
  left.start();
  right.start();

  let enter: () => void = () => undefined;
  let release: () => void = () => undefined;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  workspace.beforeReveal = async (leaf) => {
    if (leaf.getRoot() !== workspace.leftSplit) return;
    enter();
    await paused;
  };

  // The right user's change is pending before the left operation starts.
  resize(workspace, 52, 48);
  const manualRight = captureSidebar(workspace.app, 'right');
  const applying = left.apply('L2');
  await entered;
  const queued = left.apply('L1');
  const intermediate = captureSidebar(workspace.app, 'left');
  expect(intermediate).not.toEqual(originalLeft);
  expect(intermediate).not.toEqual(nextLeft);
  workspace.emit('layout-change');
  workspace.emit('resize');
  await vi.advanceTimersByTimeAsync(701);

  expect(plugin.snapshots).toHaveLength(1);
  expect(store.find('R1')).toMatchObject({ working: manualRight });
  expect(store.find('L1')).not.toHaveProperty('working');
  expect(store.find('L2')).not.toHaveProperty('working');
  expect(store.current.governing).toEqual({ left: 'L1', right: 'R1' });
  expect(captureSidebar(workspace.app, 'left')).toEqual(intermediate);

  delete workspace.beforeReveal;
  release();
  await Promise.all([applying, queued]);
  expect(plugin.snapshots.map((data) => data.governing)).toEqual([
    { left: 'L1', right: 'R1' },
    { left: 'L2', right: 'R1' },
    { left: 'L1', right: 'R1' },
  ]);
  expect(captureSidebar(workspace.app, 'left')).toEqual(originalLeft);
  expect(captureSidebar(workspace.app, 'right')).toEqual(manualRight);
  expect(store.find('R1')).toMatchObject({ working: manualRight });
  expect(store.find('L1')).not.toHaveProperty('working');
  expect(store.find('L2')).not.toHaveProperty('working');
  left.stop();
  right.stop();
  plugin.unload();
});
