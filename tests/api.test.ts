import type { App, PluginManifest } from 'obsidian';
import * as obsidian from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Controller } from '../src/controller';
import { applyArrangement } from '../src/layout/apply';
import { captureSidebar } from '../src/layout/capture';
import { notify } from '../src/logging';
import SidebarLayoutsPlugin from '../src/main';
import type { LayoutButton } from '../src/model';
import { applyManagedTabStyle, removeManagedTabStyle } from '../src/ui/managedTabs';

const host = vi.hoisted(() => ({
  controllers: null as Record<'left' | 'right', Controller> | null,
  load: vi.fn(),
  save: vi.fn(),
  command: vi.fn(),
  placeholder: '',
  choose: null as ((layout: LayoutButton) => void) | null,
  name: null as ((name: string) => void) | null,
  icon: null as ((icon: string) => void) | null,
}));
vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    Plugin: class {
      constructor(
        readonly app: unknown,
        readonly manifest: unknown,
      ) {}
      loadData = host.load;
      saveData = host.save;
      addCommand = host.command;
      addSettingTab() {}
      registerEvent() {}
      register() {}
    },
  };
});
vi.mock('../src/ui/buttons', () => ({
  sidebarDocument: () => document,
  ButtonRow: class {
    start() {}
    sync() {}
  },
}));
vi.mock('../src/ui/settings', () => ({
  SidebarLayoutsSettingTab: class {
    constructor(controllers: Record<'left' | 'right', Controller>) {
      host.controllers = controllers;
    }
  },
}));
vi.mock('../src/ui/modals', () => ({
  LayoutSuggest: class {
    constructor(
      _app: unknown,
      _layouts: readonly LayoutButton[],
      placeholder: string,
      choose: (layout: LayoutButton) => void,
    ) {
      host.placeholder = placeholder;
      host.choose = choose;
    }
    open() {}
  },
  SaveLayoutModal: class {
    constructor(
      _app: unknown,
      _side: unknown,
      _shape: unknown,
      choose: (name: string, icon: string) => void,
    ) {
      host.name = (name) => {
        host.icon = (icon) => choose(name, icon);
      };
    }
    open() {}
  },
  IconSuggest: class {
    constructor(_app: unknown, choose: (icon: string) => void) {
      host.icon = choose;
    }
    open() {}
  },
}));
vi.mock('../src/ui/managedTabs', () => ({
  applyManagedTabStyle: vi.fn(),
  removeManagedTabStyle: vi.fn(),
}));
vi.mock('../src/ui/topTabWatcher', () => ({ watchTopTab: vi.fn() }));
vi.mock('../src/layout/apply', () => ({
  applyArrangement: vi.fn(),
  reconcileFloors: vi.fn(),
  restoreArrangementFloors: vi.fn(),
  revealedOnTop: vi.fn(() => 'tag'),
}));
vi.mock('../src/layout/capture', () => ({
  captureSidebar: vi.fn(() => ({ home: 'tag', floors: [] })),
}));
vi.mock('../src/logging', () => ({ notify: vi.fn(), reportError: vi.fn() }));

const layout: LayoutButton = {
  kind: 'layout',
  side: 'right',
  placement: 'header',
  showWhenCollapsed: false,
  id: 'A',
  name: 'A',
  icon: 'tag',
  visible: true,
  saved: { home: 'tag', floors: [{ view: 'backlink' }] },
  fullWidthNotes: false,
  registerCommand: true,
};
function plugin() {
  const app = {
    workspace: { on: vi.fn(), onLayoutReady: vi.fn() },
    commands: { removeCommand: vi.fn() },
  } as unknown as App;
  return new SidebarLayoutsPlugin(app, { id: 'sidebar-layouts' } as PluginManifest);
}

beforeEach(() => {
  vi.clearAllMocks();
  host.controllers = null;
  host.choose = null;
  host.name = null;
  host.icon = null;
  vi.mocked(captureSidebar).mockReturnValue({ home: 'tag', floors: [] });
  host.load.mockResolvedValue({ buttons: [layout] });
  host.save.mockResolvedValue(undefined);
  vi.mocked(applyArrangement).mockResolvedValue(true);
});

describe('public API lifecycle', () => {
  it('applies through the real controller and exposes isolated layout snapshots', async () => {
    const instance = plugin();
    expect(instance.api.list()).toEqual([]);
    expect(instance.api.governing('right')).toBeNull();
    await instance.onload();
    expect(instance.api.version).toBe(1);
    await instance.api.apply('A');
    expect(instance.api.governing('right')).toBe('A');
    const result = instance.api.list() as unknown as { saved: { floors: { view: string }[] } }[];
    if (result[0]?.saved.floors[0]) result[0].saved.floors[0].view = 'changed';
    expect(instance.api.list()[0]?.saved.floors[0]?.view).toBe('backlink');
    expect(instance.api.capture('right')).toEqual({ home: 'tag', floors: [] });
    instance.onunload();
    expect(instance.api.list()).toEqual([]);
    expect(instance.api.governing('right')).toBeNull();
    expect(instance.api.capture('right')).toBeUndefined();
    await instance.api.apply('A');
    expect(applyArrangement).toHaveBeenCalledTimes(1);
  });

  it('does not start a controller if unload happened while data was loading', async () => {
    let resolve!: (data: unknown) => void;
    host.load.mockReturnValueOnce(
      new Promise<unknown>((yes) => {
        resolve = yes;
      }),
    );
    const instance = plugin();
    const loading = instance.onload();
    instance.onunload();
    resolve({ buttons: [layout] });
    await loading;
    expect(instance.api.list()).toEqual([]);
    expect(host.command).not.toHaveBeenCalled();
  });
});

function runRegistered(id: string): void {
  const commands = host.command.mock.calls as [{ id: string; callback: () => void }][];
  const command = commands.find(([entry]) => entry.id === id)?.[0];
  if (command === undefined) throw new Error(`Missing command: ${id}`);
  command.callback();
}

describe('plugin command entry points', () => {
  it('opens the layout picker and applies its selection', async () => {
    const instance = plugin();
    await instance.onload();
    runRegistered('apply-right');
    expect(host.choose).not.toBeNull();
    host.choose?.(layout);
    await vi.waitFor(() => expect(instance.api.governing('right')).toBe('A'));
    instance.onunload();
  });

  it('explains that the layout picker is empty', async () => {
    host.load.mockResolvedValueOnce({ buttons: [] });
    const instance = plugin();
    await instance.onload();
    runRegistered('apply-right');
    expect(host.choose).toBeNull();
    expect(notify).toHaveBeenCalledWith('no layouts saved yet');
    instance.onunload();
  });

  it('saves a new layout through the registered capture command', async () => {
    const instance = plugin();
    await instance.onload();
    runRegistered('save-as-new-right');
    host.name?.('Captured');
    host.icon?.('book');
    await vi.waitFor(() => expect(instance.api.list()).toHaveLength(2));
    expect(instance.api.list()[1]).toMatchObject({
      name: 'Captured',
      placement: 'header',
      showWhenCollapsed: false,
      icon: 'book',
      saved: { home: 'tag', floors: [] },
    });
    instance.onunload();
  });
});

it('routes API calls and explicit left commands to the owning sidebar', async () => {
  const left: LayoutButton = { ...layout, id: 'L', side: 'left', name: 'Left' };
  host.load.mockResolvedValueOnce({ buttons: [layout, left] });
  const instance = plugin();
  await instance.onload();
  await Promise.all([instance.api.apply('L'), instance.api.apply('A')]);
  expect(instance.api.governing('right')).toBe('A');
  expect(instance.api.governing('left')).toBe('L');
  expect(instance.api.list().map((button) => button.id)).toEqual(['A', 'L']);
  expect(instance.api.list('left')).toEqual([left]);
  expect(instance.api.list('right')).toEqual([layout]);
  expect(applyArrangement).toHaveBeenCalledWith(
    expect.anything(),
    left.saved,
    expect.any(Function),
    'left',
  );
  instance.api.capture('left');
  expect(captureSidebar).toHaveBeenLastCalledWith(instance.app, 'left');
  runRegistered('apply-left');
  host.choose?.(left);
  await vi.waitFor(() => expect(applyArrangement).toHaveBeenCalledTimes(3));
  runRegistered('save-as-new-left');
  host.name?.('New left');
  host.icon?.('folder');
  await vi.waitFor(() => expect(instance.api.list('left')).toHaveLength(2));
  expect(instance.api.list('right')).toHaveLength(1);
  instance.onunload();
});

it('refreshes both side styles for shared flags and removes both on unload', async () => {
  host.load.mockResolvedValueOnce({ buttons: [layout, { ...layout, id: 'L', side: 'left' }] });
  const instance = plugin();
  await instance.onload();
  await host.controllers?.left.setFlag('hideManagedTabs', true);
  expect(applyManagedTabStyle).toHaveBeenCalledWith(document, expect.any(Set), true, 'left');
  expect(applyManagedTabStyle).toHaveBeenCalledWith(document, expect.any(Set), true, 'right');
  expect(host.controllers?.right.data.hideManagedTabs).toBe(true);
  instance.onunload();
  expect(removeManagedTabStyle).toHaveBeenCalledWith(document, 'left');
  expect(removeManagedTabStyle).toHaveBeenCalledWith(document, 'right');
});

afterEach(() => vi.restoreAllMocks());

it('localizes built-in command names and picker prompts while preserving saved names and IDs', async () => {
  vi.spyOn(obsidian, 'getLanguage').mockReturnValue('ru');
  host.load.mockResolvedValueOnce({ buttons: [layout, { ...layout, id: 'L', side: 'left' }] });
  const instance = plugin();
  await instance.onload();
  const commands = host.command.mock.calls.map(([entry]) => entry as { id: string; name: string });
  expect(commands).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'apply-right',
        name: 'Переключить раскладку правой боковой панели',
      }),
      expect.objectContaining({
        id: 'apply-left',
        name: 'Переключить раскладку левой боковой панели',
      }),
      expect.objectContaining({
        id: 'save-as-new-right',
        name: 'Создать раскладку из правой боковой панели',
      }),
      expect.objectContaining({
        id: 'save-as-new-left',
        name: 'Создать раскладку из левой боковой панели',
      }),
      expect.objectContaining({ id: 'apply-A', name: 'A' }),
    ]),
  );
  runRegistered('apply-right');
  expect(host.placeholder).toBe('На какую раскладку переключить правую боковую панель?');
  runRegistered('apply-left');
  expect(host.placeholder).toBe('На какую раскладку переключить левую боковую панель?');
  expect(instance.api.list()[0]).toEqual(layout);
  instance.onunload();
});

it('localizes the empty layout picker notice', async () => {
  vi.spyOn(obsidian, 'getLanguage').mockReturnValue('ru');
  host.load.mockResolvedValueOnce({ buttons: [] });
  const instance = plugin();
  await instance.onload();
  runRegistered('apply-right');
  expect(notify).toHaveBeenCalledWith('сохранённых раскладок пока нет');
  instance.onunload();
});
