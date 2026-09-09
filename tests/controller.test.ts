import type { Plugin } from 'obsidian';
import * as obsidian from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Controller } from '../src/controller';
import {
  applyArrangement,
  reconcileFloors,
  restoreArrangementFloors,
  revealedOnTop,
} from '../src/layout/apply';
import { captureSidebar } from '../src/layout/capture';
import { notify, reportError } from '../src/logging';
import type { Arrangement, LayoutButton, SidebarSide } from '../src/model';
import { Store } from '../src/store';
import type { RowItem } from '../src/ui/buttons';
import { applyManagedTabStyle } from '../src/ui/managedTabs';
import { watchTopTab } from '../src/ui/topTabWatcher';

const ui = vi.hoisted(() => ({
  row: (): RowItem[] => [],
  tooltips: (): boolean => true,
  name: null as ((name: string) => void) | null,
  icon: null as ((icon: string) => void) | null,
  command: null as ((command: { id: string; name: string }) => void) | null,
}));

vi.mock('../src/ui/buttons', () => ({
  sidebarDocument: () => document,
  ButtonRow: class {
    constructor(_plugin: unknown, items: () => RowItem[], tooltips: () => boolean) {
      ui.row = items;
      ui.tooltips = tooltips;
    }
    start() {}
    sync() {}
  },
}));
vi.mock('../src/ui/modals', () => ({
  SaveLayoutModal: class {
    constructor(
      _app: unknown,
      _side: unknown,
      _shape: unknown,
      choose: (name: string, icon: string) => void,
    ) {
      ui.name = (name) => {
        ui.icon = (icon) => choose(name, icon);
      };
    }
    open() {}
  },
  IconSuggest: class {
    constructor(_app: unknown, choose: (icon: string) => void) {
      ui.icon = choose;
    }
    open() {}
  },
  CommandSuggest: class {
    constructor(_app: unknown, choose: (command: { id: string; name: string }) => void) {
      ui.command = choose;
    }
    open() {}
  },
}));
vi.mock('../src/ui/managedTabs', () => ({ applyManagedTabStyle: vi.fn() }));
vi.mock('../src/ui/topTabWatcher', () => ({ watchTopTab: vi.fn() }));
vi.mock('../src/layout/apply', () => ({
  applyArrangement: vi.fn(),
  reconcileFloors: vi.fn(),
  restoreArrangementFloors: vi.fn(),
  revealedOnTop: vi.fn(),
}));
vi.mock('../src/layout/capture', () => ({ captureSidebar: vi.fn() }));
vi.mock('../src/logging', () => ({ notify: vi.fn(), reportError: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const shape = (floor: string, dimension = 30): Arrangement => ({
  home: 'tag',
  homeDimension: 100 - dimension,
  floors: [{ view: floor, dimension }],
});
const layout = (id: string, floor: string): LayoutButton => ({
  kind: 'layout',
  side: 'right',
  placement: 'header',
  showWhenCollapsed: false,
  id,
  name: id,
  icon: 'tag',
  visible: true,
  saved: shape(floor),
  fullWidthNotes: true,
  registerCommand: true,
});

async function fixture() {
  const events = new Map<string, () => void>();
  const plugin = {
    manifest: { id: 'sidebar-layouts' },
    app: {
      workspace: {
        on: (event: string, callback: () => void) => {
          const previous = events.get(event);
          events.set(event, () => {
            previous?.();
            callback();
          });
        },
        onLayoutReady: vi.fn(),
      },
      commands: { removeCommand: vi.fn(), executeCommandById: vi.fn().mockReturnValue(true) },
    },
    loadData: async () => ({
      buttons: [layout('A', 'backlink'), layout('B', 'outline')],
      governing: { left: null, right: 'A' },
    }),
    saveData: vi.fn().mockResolvedValue(undefined),
    addCommand: vi.fn(),
    registerEvent: vi.fn(),
    register: vi.fn(),
  };
  const store = new Store(plugin as unknown as Plugin);
  await store.load();
  const controller = new Controller(plugin as unknown as Plugin, store);
  controller.start();
  return { controller, store, plugin, events };
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
  ui.name = null;
  ui.icon = null;
  ui.command = null;
  vi.mocked(applyArrangement).mockResolvedValue(true);
  vi.mocked(reconcileFloors).mockResolvedValue(true);
  vi.mocked(restoreArrangementFloors).mockResolvedValue(true);
  vi.mocked(revealedOnTop).mockReturnValue('tag');
  vi.mocked(captureSidebar).mockReturnValue(shape('backlink'));
});

describe('Controller operation ordering', () => {
  it('records a resize before switching during the debounce window', async () => {
    vi.useFakeTimers();
    const { controller, store, events } = await fixture();
    vi.mocked(captureSidebar).mockReturnValue(shape('backlink', 55));
    events.get('resize')?.();
    await controller.apply('B');
    expect(store.find('A')).toMatchObject({ working: shape('backlink', 55) });
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.current.governing.right).toBe('B');
    controller.stop();
    vi.useRealTimers();
  });

  it('serializes overlapping applications', async () => {
    const first = deferred<boolean>();
    vi.mocked(applyArrangement).mockReturnValueOnce(first.promise);
    const { controller, store } = await fixture();
    const one = controller.apply('A');
    const two = controller.apply('B');
    await Promise.resolve();
    expect(applyArrangement).toHaveBeenCalledTimes(1);
    first.resolve(true);
    await Promise.all([one, two]);
    expect(applyArrangement).toHaveBeenCalledTimes(2);
    expect(store.current.governing.right).toBe('B');
  });

  it('does not save or restore managed styles after stopping an in-flight apply', async () => {
    const first = deferred<boolean>();
    vi.mocked(applyArrangement).mockReturnValueOnce(first.promise);
    const { controller, plugin } = await fixture();
    const applying = controller.apply('B');
    await Promise.resolve();
    controller.stop();
    first.resolve(true);
    await applying;
    expect(plugin.saveData).not.toHaveBeenCalled();
    expect(applyManagedTabStyle).not.toHaveBeenCalled();
  });

  it('does not resurrect the governing id when the applied layout was deleted', async () => {
    const first = deferred<boolean>();
    vi.mocked(applyArrangement).mockReturnValueOnce(first.promise);
    const { controller, store } = await fixture();
    const applying = controller.apply('B');
    await Promise.resolve();
    await controller.remove('B');
    first.resolve(true);
    await applying;
    expect(store.find('B')).toBeNull();
    expect(store.current.governing.right).toBe('A');
  });

  it('keeps governing unchanged when the host cannot apply the requested layout', async () => {
    const { controller, store, plugin } = await fixture();
    vi.mocked(applyArrangement).mockResolvedValueOnce(false);
    await controller.apply('B');
    expect(store.current.governing.right).toBe('A');
    expect(plugin.saveData).not.toHaveBeenCalled();
  });

  it('reports host failures and still executes later applications', async () => {
    const { controller, store } = await fixture();
    vi.mocked(applyArrangement).mockRejectedValueOnce(new Error('missing view'));
    await expect(controller.apply('B')).resolves.toBeUndefined();
    expect(store.current.governing.right).toBe('A');
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'Updating sidebar');
    await controller.apply('B');
    expect(store.current.governing.right).toBe('B');
  });

  it('restores floors and heights when full-width notes is turned off', async () => {
    const { controller, store } = await fixture();
    vi.mocked(revealedOnTop).mockReturnValue('markdown');
    const onShown = vi.mocked(watchTopTab).mock.calls[0]?.[1];
    onShown?.('markdown');
    // The public edit operation queues behind the pending collapse.
    await controller.edit('A', (button) => ({ ...button, fullWidthNotes: false }));
    expect(reconcileFloors).toHaveBeenCalledWith(
      expect.anything(),
      [],
      expect.any(Function),
      'right',
    );
    expect(restoreArrangementFloors).toHaveBeenCalledWith(
      expect.anything(),
      shape('backlink'),
      expect.any(Function),
      'right',
    );
    expect(store.find('A')).toMatchObject({ fullWidthNotes: false });
    controller.stop();
  });

  it('returns defensive snapshots for API consumers', async () => {
    const { controller, store } = await fixture();
    const exposed = controller.layouts() as unknown as { saved: { floors: { view: string }[] } }[];
    if (exposed[0]?.saved.floors[0]) exposed[0].saved.floors[0].view = 'mutated';
    expect(store.find('A')).toMatchObject({ saved: shape('backlink') });
  });
});

describe('Controller failure and reset boundaries', () => {
  it('keeps a pending resize available for retry when saving it fails', async () => {
    const { controller, store, plugin, events } = await fixture();
    vi.mocked(captureSidebar).mockReturnValue(shape('backlink', 55));
    events.get('resize')?.();
    plugin.saveData.mockRejectedValueOnce(new Error('disk full'));
    await controller.apply('B');
    expect(applyArrangement).not.toHaveBeenCalled();
    expect(store.current.governing.right).toBe('A');
    await controller.apply('B');
    expect(store.find('A')).toMatchObject({ working: shape('backlink', 55) });
    expect(store.current.governing.right).toBe('B');
    controller.stop();
  });

  it('resets a pending resize without immediately recording it again', async () => {
    const { controller, store, events } = await fixture();
    await store.update((data) => {
      const original = data.buttons[0];
      if (original?.kind === 'layout')
        data.buttons[0] = { ...original, working: shape('backlink', 55) };
    });
    vi.mocked(captureSidebar).mockReturnValue(shape('backlink', 65));
    events.get('resize')?.();
    await controller.reset('A');
    expect(store.find('A')).not.toHaveProperty('working');
    expect(applyArrangement).toHaveBeenCalledWith(
      expect.anything(),
      shape('backlink'),
      expect.any(Function),
      'right',
    );
    controller.stop();
  });

  it('keeps the active layout resize pending when restoring an inactive saved layout', async () => {
    const { controller, store, events } = await fixture();
    await store.update((data) => {
      const index = data.buttons.findIndex((button) => button.id === 'B');
      const inactive = data.buttons[index];
      if (inactive?.kind === 'layout')
        data.buttons[index] = { ...inactive, working: shape('outline', 45) };
    });
    vi.mocked(captureSidebar).mockReturnValue(shape('backlink', 57));
    events.get('resize')?.();
    await controller.reset('B');
    expect(store.find('B')).not.toHaveProperty('working');
    expect(applyArrangement).not.toHaveBeenCalled();
    await controller.apply('B');
    expect(store.find('A')).toMatchObject({ working: shape('backlink', 57) });
    expect(store.current.governing.right).toBe('B');
    expect(applyArrangement).toHaveBeenCalledWith(
      expect.anything(),
      shape('outline'),
      expect.any(Function),
      'right',
    );
    controller.stop();
  });

  it('does not register a command after unloading during an edit save', async () => {
    const saving = deferred<void>();
    const { controller, plugin } = await fixture();
    plugin.addCommand.mockClear();
    plugin.saveData.mockReturnValueOnce(saving.promise);
    const editing = controller.edit('A', (button) => ({ ...button, name: 'Updated' }));
    await Promise.resolve();
    controller.stop();
    saving.resolve(undefined);
    await editing;
    expect(plugin.addCommand).not.toHaveBeenCalled();
    expect(applyManagedTabStyle).not.toHaveBeenCalled();
  });
});

it('resolves drag endpoints by identity after an earlier queued deletion', async () => {
  const { controller, store, plugin } = await fixture();
  await store.update((data) => {
    data.buttons.push(layout('C', 'outgoing-link'));
  });
  const saving = deferred<void>();
  plugin.saveData.mockReturnValueOnce(saving.promise);
  const deleting = controller.remove('A');
  const moving = controller.moveTo(1, 2);
  await Promise.resolve();
  saving.resolve(undefined);
  await Promise.all([deleting, moving]);
  expect(store.current.buttons.map((button) => button.id)).toEqual(['C', 'B']);
});

function rowItem(id: string): RowItem {
  const item = ui.row().find((entry) => entry.key === id);
  if (item === undefined) throw new Error(`Missing row item: ${id}`);
  return item;
}

function chooseMenu(id: string, label: string): void {
  rowItem(id).onMenu(new MouseEvent('contextmenu'));
  const action = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (button) => button.textContent === label,
  );
  if (action === undefined) throw new Error(`Missing menu action: ${label}`);
  action.click();
}

describe('Controller user actions', () => {
  it('rejects an empty capture and saves a named capture with its chosen icon', async () => {
    const { controller, store, plugin } = await fixture();
    const created = vi.fn();
    vi.mocked(captureSidebar).mockReturnValueOnce({ home: null, floors: [] });
    controller.createLayout(created);
    expect(notify).toHaveBeenCalledWith('the right sidebar is empty, nothing to save');
    expect(ui.name).toBeNull();
    controller.createLayout(created);
    ui.name?.('Research');
    ui.icon?.('book');
    await vi.waitFor(() => expect(created).toHaveBeenCalledTimes(1));
    const saved = store.current.buttons.find((button) => button.name === 'Research');
    expect(saved).toMatchObject({
      kind: 'layout',
      side: 'right',
      placement: 'header',
      showWhenCollapsed: false,
      icon: 'book',
      saved: shape('backlink'),
      visible: true,
      registerCommand: true,
    });
    expect(plugin.addCommand).toHaveBeenCalledWith(
      expect.objectContaining({ id: `apply-${saved?.id}`, name: 'Research' }),
    );
    expect(rowItem(saved?.id ?? '').label).toBe('Research');
  });

  it('does not announce creation when saving the new layout fails', async () => {
    const { controller, store, plugin } = await fixture();
    plugin.saveData.mockRejectedValueOnce(new Error('disk full'));
    const created = vi.fn();
    controller.createLayout(created);
    ui.name?.('Unsaved');
    ui.icon?.('book');
    await vi.waitFor(() => expect(reportError).toHaveBeenCalled());
    expect(created).not.toHaveBeenCalled();
    expect(store.current.buttons).toHaveLength(2);
  });

  it('adds and runs a command button, reporting an unavailable command', async () => {
    const { controller, store, plugin } = await fixture();
    const added = vi.fn();
    controller.addCommand(added);
    ui.command?.({ id: 'app:settings', name: 'Open settings' });
    ui.icon?.('settings');
    await vi.waitFor(() => expect(added).toHaveBeenCalledTimes(1));
    const button = store.current.buttons.find((entry) => entry.kind === 'command');
    expect(button).toMatchObject({
      commandId: 'app:settings',
      placement: 'header',
      showWhenCollapsed: false,
      name: 'Open settings',
      icon: 'settings',
    });
    rowItem(button?.id ?? '').onClick();
    expect(plugin.app.commands.executeCommandById).toHaveBeenCalledWith('app:settings');
    expect(notify).not.toHaveBeenCalled();
    plugin.app.commands.executeCommandById.mockReturnValueOnce(false);
    rowItem(button?.id ?? '').onClick();
    expect(notify).toHaveBeenCalledWith('"Open settings" is not available');
    chooseMenu(button?.id ?? '', 'Delete');
    await vi.waitFor(() => expect(store.find(button?.id ?? '')).toBeNull());
  });

  it('runs layouts from row buttons and registered commands with current row state', async () => {
    const { store, plugin } = await fixture();
    expect(rowItem('A').active).toBe(true);
    expect(rowItem('B').active).toBe(false);
    rowItem('B').onClick();
    await vi.waitFor(() => expect(store.current.governing.right).toBe('B'));
    expect(rowItem('B').active).toBe(true);
    const commands = plugin.addCommand.mock.calls as [{ id: string; callback: () => void }][];
    const command = commands.find(([entry]) => entry.id === 'apply-A')?.[0];
    expect(command).toBeDefined();
    command?.callback();
    await vi.waitFor(() => expect(store.current.governing.right).toBe('A'));
    vi.mocked(revealedOnTop).mockReturnValue('markdown');
    expect(rowItem('A').active).toBe(false);
  });

  it('promotes a modified layout from its context menu and resets a later change', async () => {
    const { store, controller } = await fixture();
    await store.update((data) => {
      data.buttons[0] = { ...layout('A', 'backlink'), working: shape('backlink', 55) };
    });
    chooseMenu('A', 'Save changes');
    await vi.waitFor(() => expect(store.find('A')).toMatchObject({ saved: shape('backlink', 55) }));
    expect(store.find('A')).not.toHaveProperty('working');
    await store.update((data) => {
      const saved = data.buttons[0];
      if (saved?.kind === 'layout') data.buttons[0] = { ...saved, working: shape('backlink', 65) };
    });
    chooseMenu('A', 'Restore saved layout');
    await vi.waitFor(() =>
      expect(applyArrangement).toHaveBeenCalledWith(
        expect.anything(),
        shape('backlink', 55),
        expect.any(Function),
        'right',
      ),
    );
    expect(store.find('A')).not.toHaveProperty('working');
    controller.stop();
  });

  it('toggles managed tabs and deletes the governing layout from the menu', async () => {
    const { store } = await fixture();
    chooseMenu('A', 'Show panel tabs');
    await vi.waitFor(() => expect(store.current.hideManagedTabs).toBe(false));
    chooseMenu('A', 'Hide panel tabs');
    await vi.waitFor(() => expect(store.current.hideManagedTabs).toBe(true));
    chooseMenu('A', 'Delete');
    await vi.waitFor(() => expect(store.find('A')).toBeNull());
    expect(store.current.governing.right).toBeNull();
    expect(ui.row().every((button) => !button.active)).toBe(true);
  });

  it('updates visibility, tooltips, order and command registration through settings actions', async () => {
    const { controller, store, plugin } = await fixture();
    await controller.setVisible('A', false);
    expect(ui.row().map((entry) => entry.key)).toEqual(['B']);
    await controller.setFlag('showTooltips', false);
    expect(ui.tooltips()).toBe(false);
    await controller.edit('A', (button) => ({
      ...button,
      name: 'Renamed',
      registerCommand: false,
    }));
    expect(plugin.app.commands.removeCommand).toHaveBeenCalledWith('sidebar-layouts:apply-A');
    await controller.edit('A', (button) => ({ ...button, registerCommand: true }));
    expect(plugin.addCommand).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'apply-A', name: 'Renamed' }),
    );
    await controller.move('A', 1);
    await controller.move('A', 1);
    await controller.moveTo(-1, 0);
    await controller.moveTo(0, 50);
    await controller.moveTo(0.5, 1);
    expect(store.current.buttons.map((button) => button.id)).toEqual(['B', 'A']);
    await controller.move('A', -1);
    expect(store.current.buttons.map((button) => button.id)).toEqual(['A', 'B']);
    controller.stop();
  });

  it('reports command registration failure without losing the saved edit', async () => {
    const { controller, store, plugin } = await fixture();
    plugin.addCommand.mockImplementationOnce(() => {
      throw new Error('host registry unavailable');
    });
    await controller.edit('A', (button) => ({ ...button, name: 'Changed' }));
    expect(store.find('A')?.name).toBe('Changed');
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      'Registering command for "Changed"',
    );
  });
});

it('fits the initially shown note on layout-ready and restores floors when returning home', async () => {
  vi.mocked(revealedOnTop).mockReturnValue('markdown');
  const { controller, plugin } = await fixture();
  const ready = plugin.app.workspace.onLayoutReady.mock.calls[0]?.[0] as (() => void) | undefined;
  ready?.();
  await vi.waitFor(() =>
    expect(reconcileFloors).toHaveBeenCalledWith(
      expect.anything(),
      [],
      expect.any(Function),
      'right',
    ),
  );
  vi.mocked(revealedOnTop).mockReturnValue('tag');
  vi.mocked(watchTopTab).mock.calls[0]?.[1]('tag');
  await vi.waitFor(() =>
    expect(restoreArrangementFloors).toHaveBeenCalledWith(
      expect.anything(),
      shape('backlink'),
      expect.any(Function),
      'right',
    ),
  );
  controller.stop();
  vi.mocked(reconcileFloors).mockClear();
  ready?.();
  expect(reconcileFloors).not.toHaveBeenCalled();
});

async function dualFixture() {
  const f = await fixture();
  await f.store.update((data) => {
    data.buttons = [
      layout('A', 'backlink'),
      { ...layout('L1', 'file-explorer'), side: 'left' },
      layout('B', 'outline'),
      { ...layout('L2', 'search'), side: 'left' },
    ];
    data.governing.left = 'L1';
  });
  const left = new Controller(f.plugin as unknown as Plugin, f.store, 'left');
  left.start();
  f.plugin.saveData.mockClear();
  return { ...f, right: f.controller, left };
}

describe('independent sidebar controllers', () => {
  it('rejects cross-side IDs and keeps identity fields immutable', async () => {
    const { left, right, store, plugin, events } = await dualFixture();
    expect(left.data.buttons.map((button) => button.id)).toEqual(['L1', 'L2']);
    expect(right.layouts().map((button) => button.id)).toEqual(['A', 'B']);
    events.get('resize')?.();
    await left.apply('B');
    await left.edit('B', (button) => ({ ...button, name: 'wrong side' }));
    await left.remove('B');
    await left.reset('B');
    await left.promote('B');
    await left.move('B', -1);
    await left.setVisible('B', false);
    expect(plugin.saveData).not.toHaveBeenCalled();
    expect(applyArrangement).not.toHaveBeenCalled();
    await left.edit('L1', (button) => ({ ...button, id: 'B', side: 'right' }));
    await left.edit('L1', (button) => ({
      ...button,
      kind: 'command',
      commandId: 'search',
    }));
    expect(store.find('L1')).toMatchObject({ kind: 'layout', side: 'left', name: 'L1' });
    expect(store.find('B')).toMatchObject({ kind: 'layout', side: 'right', visible: true });
    left.stop();
    right.stop();
  });

  it('uses side-local reorder positions while preserving opposite-side slots and order', async () => {
    const { left, right, store } = await dualFixture();
    await left.moveTo(0, 1);
    expect(store.current.buttons.map((button) => button.id)).toEqual(['A', 'L2', 'B', 'L1']);
    await right.move('A', 1);
    expect(store.current.buttons.map((button) => button.id)).toEqual(['B', 'L2', 'A', 'L1']);
    await left.move('L1', -1);
    expect(store.current.buttons.map((button) => button.id)).toEqual(['B', 'L1', 'A', 'L2']);
    left.stop();
    right.stop();
  });

  it('applies the other sidebar while one is in flight and preserves both governing IDs', async () => {
    const { left, right, store } = await dualFixture();
    const pending = deferred<boolean>();
    vi.mocked(applyArrangement).mockImplementation((_app, _shape, _cancelled, side) =>
      side === 'left' ? pending.promise : Promise.resolve(true),
    );
    const applyingLeft = left.apply('L2');
    await Promise.resolve();
    await right.apply('B');
    expect(store.current.governing).toEqual({ left: 'L1', right: 'B' });
    pending.resolve(true);
    await applyingLeft;
    expect(store.current.governing).toEqual({ left: 'L2', right: 'B' });
    await left.remove('L2');
    expect(store.current.governing).toEqual({ left: null, right: 'B' });
    left.stop();
    right.stop();
  });

  it('records each sidebar geometry and isolates full-width-note collapse', async () => {
    vi.useFakeTimers();
    const { left, right, store, events } = await dualFixture();
    vi.mocked(captureSidebar).mockImplementation((_app, side) =>
      side === 'left' ? shape('file-explorer', 43) : shape('backlink', 51),
    );
    events.get('resize')?.();
    await vi.advanceTimersByTimeAsync(701);
    expect(store.find('L1')).toMatchObject({ working: shape('file-explorer', 43) });
    expect(store.find('A')).toMatchObject({ working: shape('backlink', 51) });
    vi.mocked(revealedOnTop).mockImplementation((_app, side) =>
      side === 'left' ? 'markdown' : 'tag',
    );
    const leftWatcher = vi.mocked(watchTopTab).mock.calls.find((call) => call[2] === 'left')?.[1];
    leftWatcher?.('markdown');
    await vi.advanceTimersByTimeAsync(701);
    expect(reconcileFloors).toHaveBeenCalledWith(
      expect.anything(),
      [],
      expect.any(Function),
      'left',
    );
    expect(reconcileFloors).toHaveBeenCalledTimes(1);
    expect(store.find('L1')).toMatchObject({ working: shape('file-explorer', 43) });
    expect(store.current.governing).toEqual({ left: 'L1', right: 'A' });
    left.stop();
    right.stop();
    vi.useRealTimers();
  });

  it('keeps a delayed save dialog bound to its captured side and geometry', async () => {
    const { left, right, store } = await dualFixture();
    const leftShape = {
      home: 'tag',
      homeDimension: 59,
      floors: [{ view: 'file-explorer', dimension: 41 }],
    };
    vi.mocked(captureSidebar).mockImplementation((_app, side: SidebarSide = 'right') =>
      side === 'left' ? leftShape : shape('backlink'),
    );
    const created = vi.fn();
    left.createLayout(created);
    ui.name?.('Left captured');
    const finishLeft = ui.icon;
    right.createLayout();
    const capturedFloor = leftShape.floors[0];
    if (capturedFloor === undefined) throw new Error('Expected captured floor');
    capturedFloor.view = 'changed after capture';
    finishLeft?.('folder');
    await vi.waitFor(() => expect(created).toHaveBeenCalledOnce());
    expect(store.current.buttons.find((button) => button.name === 'Left captured')).toMatchObject({
      side: 'left',
      saved: shape('file-explorer', 41),
      icon: 'folder',
    });
    expect(right.layouts()).toHaveLength(2);
    left.stop();
    right.stop();
  });
});

afterEach(() => vi.restoreAllMocks());

it('localizes per-side empty captures, menus, and unavailable command messages', async () => {
  vi.spyOn(obsidian, 'getLanguage').mockReturnValue('ru');
  const { controller, store, plugin } = await fixture();
  vi.mocked(captureSidebar).mockReturnValue({ home: null, floors: [] });
  controller.createLayout();
  expect(notify).toHaveBeenLastCalledWith('правая боковая панель пуста — сохранять нечего');
  controller.addCommand(vi.fn());
  ui.command?.({ id: 'app:settings', name: 'Open settings' });
  ui.icon?.('settings');
  await vi.waitFor(() => expect(store.current.buttons).toHaveLength(3));
  const command = store.current.buttons.find((entry) => entry.kind === 'command');
  expect(command?.name).toBe('Open settings');
  plugin.app.commands.executeCommandById.mockReturnValueOnce(false);
  rowItem(command?.id ?? '').onClick();
  expect(notify).toHaveBeenLastCalledWith('Команда «Open settings» недоступна');
  rowItem('A').onMenu(new MouseEvent('contextmenu'));
  expect(
    [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent),
  ).toEqual(['Показать вкладки панелей', 'Удалить']);
  chooseMenu(command?.id ?? '', 'Удалить');
  await vi.waitFor(() => expect(store.find(command?.id ?? '')).toBeNull());
  const left = new Controller(plugin as unknown as Plugin, store, 'left');
  left.createLayout();
  expect(notify).toHaveBeenLastCalledWith('левая боковая панель пуста — сохранять нечего');
  controller.stop();
  left.stop();
});

it('localizes failed controller operations without translating host errors', async () => {
  vi.spyOn(obsidian, 'getLanguage').mockReturnValue('ru');
  const { controller } = await fixture();
  const error = new Error('host registry unavailable');
  vi.mocked(applyArrangement).mockRejectedValueOnce(error);
  await controller.apply('B');
  expect(reportError).toHaveBeenCalledWith(error, 'Обновление боковой панели');
  controller.stop();
});

it('moves a button between placements without changing layouts or the opposite sidebar', async () => {
  const { left, right, store, plugin } = await dualFixture();
  await store.update((data) => {
    const index = data.buttons.findIndex((button) => button.id === 'L1');
    const existing = data.buttons[index];
    if (existing?.kind === 'layout')
      data.buttons[index] = { ...existing, working: shape('file-explorer', 46) };
  });
  const original = structuredClone(store.find('L1'));
  const otherButtons = structuredClone(
    store.current.buttons.filter((button) => button.id !== 'L1'),
  );
  const governing = { ...store.current.governing };
  expect(rowItem('L1').placement).toBe('header');
  await left.edit('L1', (button) => ({ ...button, placement: 'panel' }));
  expect(store.find('L1')).toEqual({ ...original, placement: 'panel' });
  expect(store.current.buttons.filter((button) => button.id !== 'L1')).toEqual(otherButtons);
  expect(store.current.governing).toEqual(governing);
  expect(rowItem('L1')).toMatchObject({ placement: 'panel', active: true });
  expect(rowItem('L2').placement).toBe('header');
  expect(plugin.saveData).toHaveBeenLastCalledWith(store.current);
  expect(applyArrangement).not.toHaveBeenCalled();
  await left.edit('L1', (button) => ({ ...button, placement: 'header' }));
  expect(store.find('L1')).toEqual(original);
  expect(rowItem('L1').placement).toBe('header');
  left.stop();
  right.stop();
});

it('passes each button closed-sidebar preference to the row without applying a layout', async () => {
  const { controller, store } = await fixture();
  expect(rowItem('A').showWhenCollapsed).toBe(false);
  await controller.edit('A', (button) => ({ ...button, showWhenCollapsed: true }));
  expect(rowItem('A').showWhenCollapsed).toBe(true);
  expect(rowItem('B').showWhenCollapsed).toBe(false);
  expect(store.find('A')).toMatchObject({ showWhenCollapsed: true });
  expect(applyArrangement).not.toHaveBeenCalled();
  await controller.edit('A', (button) => ({ ...button, showWhenCollapsed: false }));
  expect(rowItem('A').showWhenCollapsed).toBe(false);
  controller.stop();
});

it.each(['left', 'right'] as const)(
  'removes %s layout highlighting while closed without forgetting the governing layout',
  async (side) => {
    const f = side === 'left' ? await dualFixture() : await fixture();
    const workspace = Object.assign(f.plugin.app.workspace, {
      leftSplit: { collapsed: false },
      rightSplit: { collapsed: false },
    });
    const id = side === 'left' ? 'L1' : 'A';
    const split = side === 'left' ? workspace.leftSplit : workspace.rightSplit;
    const other = side === 'left' ? workspace.rightSplit : workspace.leftSplit;
    const before = structuredClone(f.store.current);
    f.plugin.saveData.mockClear();
    expect(rowItem(id).active).toBe(true);
    other.collapsed = true;
    expect(rowItem(id).active).toBe(true);
    split.collapsed = true;
    expect(rowItem(id).active).toBe(false);
    expect(f.store.current).toEqual(before);
    expect(f.plugin.saveData).not.toHaveBeenCalled();
    split.collapsed = false;
    expect(rowItem(id).active).toBe(true);
    // Reopening on an unrelated view must not light up a remembered layout.
    vi.mocked(revealedOnTop).mockReturnValue('markdown');
    expect(rowItem(id).active).toBe(false);
  },
);
