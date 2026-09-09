import type { Plugin } from 'obsidian';
import * as obsidian from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportError } from '../src/logging';
import { DEFAULT_DATA, type PluginData } from '../src/model';
import { readArrangement, readButton, readData, Store } from '../src/store';

vi.mock('../src/logging', () => ({ reportError: vi.fn() }));

describe('readData', () => {
  it('returns defaults for anything that is not an object', () => {
    for (const input of [null, undefined, 42, 'text', []]) {
      const data = readData(input);
      expect(data.buttons).toEqual([]);
      expect(data.governing).toEqual({ left: null, right: null });
      expect(data.hideManagedTabs).toBe(true);
    }
  });

  it('drops malformed entries instead of throwing', () => {
    const data = readData({
      buttons: [
        null,
        42,
        {},
        { id: 'no-saved-shape', side: 'right', placement: 'header' },
        { id: 'no-side', placement: 'header', saved: { home: 'tag' } },
        { id: 'ok', side: 'right', placement: 'header', saved: { home: 'tag' } },
      ],
    });
    expect(data.buttons.map((button) => button.id)).toEqual(['ok']);
  });

  it('keeps unknown flags at their defaults', () => {
    const data = readData({ hideManagedTabs: 'yes', showTooltips: false });
    expect(data.hideManagedTabs).toBe(true);
    expect(data.showTooltips).toBe(false);
  });

  it('reads buttons and the governing map without changing order or settings', () => {
    const buttons = [
      {
        id: 'layout',
        kind: 'layout',
        side: 'right',
        placement: 'header',
        showWhenCollapsed: false,
        name: 'My layout',
        icon: 'columns',
        visible: false,
        saved: { home: 'tag', homeDimension: 60, floors: [{ view: 'backlink', dimension: 40 }] },
        working: { home: 'outline', floors: [{ view: 'tag' }] },
        fullWidthNotes: true,
        registerCommand: false,
      },
      {
        id: 'command',
        kind: 'command',
        side: 'right',
        placement: 'panel',
        showWhenCollapsed: false,
        name: 'Settings',
        icon: 'settings',
        visible: true,
        commandId: 'app:open-settings',
      },
    ];
    expect(
      readData({
        buttons,
        governing: { left: null, right: 'layout' },
        hideManagedTabs: false,
        showTooltips: false,
      }),
    ).toEqual({
      buttons,
      governing: { left: null, right: 'layout' },
      hideManagedTabs: false,
      showTooltips: false,
    });
  });

  it('round trips both sidebar layouts and commands in their original flat order', () => {
    const data: PluginData = {
      buttons: [
        {
          kind: 'layout',
          id: 'left-layout',
          side: 'left',
          placement: 'header',
          showWhenCollapsed: false,
          name: 'Left',
          icon: 'x',
          visible: true,
          saved: { home: 'file-explorer', floors: [] },
          fullWidthNotes: false,
          registerCommand: true,
        },
        {
          kind: 'command',
          id: 'right-command',
          side: 'right',
          placement: 'panel',
          showWhenCollapsed: false,
          name: 'Settings',
          icon: 'settings',
          visible: false,
          commandId: 'app:open-settings',
        },
        {
          kind: 'layout',
          id: 'right-layout',
          side: 'right',
          placement: 'header',
          showWhenCollapsed: false,
          name: 'Right',
          icon: 'y',
          visible: true,
          saved: { home: 'tag', floors: [] },
          working: { home: 'outline', floors: [] },
          fullWidthNotes: true,
          registerCommand: false,
        },
        {
          kind: 'command',
          id: 'left-command',
          side: 'left',
          placement: 'panel',
          showWhenCollapsed: false,
          name: 'Search',
          icon: 'search',
          visible: true,
          commandId: 'global-search:open',
        },
      ],
      governing: { left: 'left-layout', right: 'right-layout' },
      hideManagedTabs: false,
      showTooltips: true,
    };
    expect(readData(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it('resolves governing IDs only to layouts in their own sidebar', () => {
    const buttons = [
      { id: 'left', side: 'left', placement: 'header', saved: {} },
      {
        id: 'command',
        side: 'right',
        placement: 'header',
        kind: 'command',
        commandId: 'app:open-settings',
      },
    ];
    expect(readData({ buttons, governing: { left: 'command', right: 'left' } }).governing).toEqual({
      left: null,
      right: null,
    });
    expect(readData({ buttons, governing: { left: 'missing' } }).governing).toEqual({
      left: null,
      right: null,
    });
  });

  it.each(['left', 'right'] as const)('keeps each stored placement on the %s side', (side) => {
    const buttons = ['header', 'panel'].flatMap((placement) => [
      { id: `${placement}-layout`, side, placement, saved: { home: 'tag', floors: [] } },
      {
        id: `${placement}-command`,
        side,
        placement,
        kind: 'command',
        commandId: 'app:open-settings',
      },
    ]);
    const read = readData({ buttons });
    expect(
      read.buttons.map(({ id, side: owner, placement }) => ({ id, side: owner, placement })),
    ).toEqual(buttons.map(({ id, side: owner, placement }) => ({ id, side: owner, placement })));
    expect(readData(JSON.parse(JSON.stringify(read)))).toEqual(read);
  });

  it('creates independent default arrays and governing maps', () => {
    const first = readData(null);
    const second = readData(undefined);
    first.governing.left = 'changed';
    expect(second.governing).toEqual({ left: null, right: null });
    expect(DEFAULT_DATA.governing).toEqual({ left: null, right: null });
    expect(first.buttons).not.toBe(second.buttons);
    expect(first.buttons).not.toBe(DEFAULT_DATA.buttons);
  });
});

describe('readArrangement', () => {
  it('keeps a height when it is a number', () => {
    expect(readArrangement({ home: 'tag', homeDimension: 61.3, floors: [] })).toEqual({
      home: 'tag',
      homeDimension: 61.3,
      floors: [],
    });
  });

  it('leaves the height out rather than inventing one', () => {
    expect(readArrangement({ home: 'tag', homeDimension: 'tall', floors: [] })).toEqual({
      home: 'tag',
      floors: [],
    });
  });

  it('drops a floor with no view', () => {
    expect(readArrangement({ floors: [{ dimension: 10 }, { view: 'tag' }] })).toEqual({
      home: null,
      floors: [{ view: 'tag' }],
    });
  });
});

describe('readButton', () => {
  it.each(['left', 'right'] as const)('reads a button stored for the %s side', (side) => {
    expect(readButton({ id: 'layout', side, placement: 'panel', saved: {} })).toMatchObject({
      side,
      placement: 'panel',
      showWhenCollapsed: false,
    });
    expect(
      readButton({
        id: 'command',
        side,
        placement: 'header',
        kind: 'command',
        commandId: 'app:open-settings',
      }),
    ).toMatchObject({ side, placement: 'header' });
  });

  it.each(['bottom', '', null, 1, {}, [], undefined])(
    'refuses a button whose placement is not one of the two: %j',
    (placement) => {
      expect(readButton({ id: 'layout', side: 'right', placement, saved: {} })).toBeNull();
      expect(
        readButton({
          id: 'command',
          side: 'right',
          placement,
          kind: 'command',
          commandId: 'app:open-settings',
        }),
      ).toBeNull();
    },
  );
  it('reads a layout with only a saved shape', () => {
    expect(
      readButton({
        id: 'l1',
        side: 'right',
        placement: 'header',
        saved: { home: 'tag', floors: [{ view: 'backlink' }] },
      }),
    ).toEqual({
      kind: 'layout',
      id: 'l1',
      side: 'right',
      placement: 'header',
      showWhenCollapsed: false,
      name: 'l1',
      icon: 'layout-panel-left',
      visible: true,
      saved: { home: 'tag', floors: [{ view: 'backlink' }] },
      fullWidthNotes: false,
      registerCommand: true,
    });
  });

  it('keeps a working shape when one is stored', () => {
    const button = readButton({
      id: 'l1',
      side: 'right',
      placement: 'header',
      saved: { home: 'tag', floors: [] },
      working: { home: 'outline', floors: [] },
    });
    expect(button).toMatchObject({ working: { home: 'outline' } });
  });

  it('refuses a layout with no saved shape, since there is nothing to restore', () => {
    expect(readButton({ id: 'l1', side: 'right', placement: 'header' })).toBeNull();
  });

  it('reads a command button', () => {
    expect(
      readButton({
        id: 'c1',
        side: 'right',
        placement: 'header',
        kind: 'command',
        commandId: 'app:open-settings',
      }),
    ).toMatchObject({ kind: 'command', commandId: 'app:open-settings' });
  });

  it('defaults visibility to shown, so a hand-edited file does not lose buttons', () => {
    const stored = {
      id: 'l1',
      side: 'right',
      placement: 'header',
      saved: { home: 'tag', floors: [] },
    };
    expect(readButton(stored)?.visible).toBe(true);
    expect(readButton({ ...stored, visible: false })?.visible).toBe(false);
  });

  it.each(['top', '', null, 1, {}, [], undefined])(
    'refuses a button whose sidebar is not one of the two: %j',
    (side) => {
      expect(readButton({ id: 'layout', side, placement: 'header', saved: {} })).toBeNull();
      expect(
        readButton({
          id: 'command',
          side,
          placement: 'header',
          kind: 'command',
          commandId: 'app:open-settings',
        }),
      ).toBeNull();
    },
  );
});

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('Store persistence', () => {
  it('writes the defaults it filled in on the next successful update', async () => {
    const stored = { buttons: [{ id: 'l1', side: 'right', placement: 'header', saved: {} }] };
    const saveData = vi.fn().mockResolvedValue(undefined);
    const store = new Store({
      loadData: async () => stored,
      saveData,
    } as unknown as Plugin);
    await store.load();
    // Repairs are not written on startup; an ordinary save carries them out.
    expect(saveData).not.toHaveBeenCalled();
    expect(
      await store.update((data) => {
        data.showTooltips = false;
      }),
    ).toBe(true);
    expect(saveData).toHaveBeenCalledWith({ ...readData(stored), showTooltips: false });
  });

  it('serializes changes to both sidebars without sharing or losing governing state', async () => {
    const first = deferred();
    const saveData = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const store = new Store({ loadData: async () => null, saveData } as unknown as Plugin);
    const other = new Store({ loadData: async () => null, saveData: vi.fn() } as unknown as Plugin);
    expect(store.current.governing).not.toBe(other.current.governing);
    await store.load();
    const one = store.update((data) => {
      data.governing.left = 'left';
    });
    const two = store.update((data) => {
      data.governing.right = 'right';
    });
    await Promise.resolve();
    expect(store.current.governing).toEqual({ left: null, right: null });
    const firstSnapshot: unknown = saveData.mock.calls[0]?.[0];
    first.resolve();
    await expect(one).resolves.toBe(true);
    await expect(two).resolves.toBe(true);
    expect(firstSnapshot).toMatchObject({ governing: { left: 'left', right: null } });
    expect(store.current.governing).toEqual({ left: 'left', right: 'right' });
    expect(other.current.governing).toEqual({ left: null, right: null });
    expect(saveData.mock.calls[1]?.[0]).toMatchObject({
      governing: { left: 'left', right: 'right' },
    });
  });

  it('serializes immutable snapshots and publishes only successful writes', async () => {
    const first = deferred();
    const saveData = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const store = new Store({ loadData: async () => null, saveData } as unknown as Plugin);
    await store.load();
    const one = store.update((data) => {
      data.showTooltips = false;
    });
    const two = store.update((data) => {
      data.hideManagedTabs = false;
    });
    await Promise.resolve();
    expect(saveData).toHaveBeenCalledTimes(1);
    expect(store.current.showTooltips).toBe(true);
    const firstSnapshot: unknown = saveData.mock.calls[0]?.[0];
    first.resolve();
    await expect(one).resolves.toBe(true);
    await expect(two).resolves.toBe(true);
    expect(firstSnapshot).toMatchObject({ showTooltips: false, hideManagedTabs: true });
    expect(saveData.mock.calls[1]?.[0]).toMatchObject({
      showTooltips: false,
      hideManagedTabs: false,
    });
    expect(store.current).toMatchObject({ showTooltips: false, hideManagedTabs: false });
  });

  it('reports a failed write without committing it or blocking the next update', async () => {
    const saveData = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue(undefined);
    const store = new Store({ loadData: async () => null, saveData } as unknown as Plugin);
    await store.load();
    await expect(
      store.update((data) => {
        data.showTooltips = false;
      }),
    ).resolves.toBe(false);
    expect(store.current.showTooltips).toBe(true);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'Saving layouts');
    await expect(
      store.update((data) => {
        data.hideManagedTabs = false;
      }),
    ).resolves.toBe(true);
    expect(store.current).toMatchObject({ showTooltips: true, hideManagedTabs: false });
  });

  it.each([
    { buttons: [{ id: 'good', saved: { home: 'tag' } }, { id: 'bad' }] },
    {
      buttons: [
        { id: 'same', saved: {} },
        { id: 'same', saved: {} },
      ],
    },
    { buttons: 'damaged' },
    { buttons: [{ id: 'bad-floor', saved: { floors: [{ dimension: 20 }] } }] },
    { buttons: [{ id: 'bad-height', saved: { home: 'tag', homeDimension: -10 } }] },
    { buttons: [{ id: 'wrong-side', side: 'top', saved: {} }] },
    { buttons: [{ id: 'wrong-placement', placement: 'bottom', saved: {} }] },
    {
      buttons: [
        { id: 'wrong-command-placement', placement: null, kind: 'command', commandId: 'settings' },
      ],
    },
    { buttons: [{ id: 'wrong-command-side', side: null, kind: 'command', commandId: 'settings' }] },
    { governing: 42 },
    { governing: [] },
    { governing: {} },
    { governing: { left: null } },
    { governing: { left: false, right: null } },
    { governing: { left: null, right: [] } },
    { governing: { left: null, right: null, top: 'recoverable' } },
    [],
  ])('refuses to overwrite damaged data: %j', async (raw) => {
    const saveData = vi.fn();
    const store = new Store({ loadData: async () => raw, saveData } as unknown as Plugin);
    await store.load();
    await expect(
      store.update((data) => {
        data.showTooltips = false;
      }),
    ).resolves.toBe(false);
    expect(saveData).not.toHaveBeenCalled();
  });

  it('freezes writes after a load failure', async () => {
    const saveData = vi.fn();
    const store = new Store({
      loadData: async () => {
        throw new Error('unreadable');
      },
      saveData,
    } as unknown as Plugin);
    await store.load();
    expect(
      await store.update((data) => {
        data.buttons = [];
      }),
    ).toBe(false);
    expect(saveData).not.toHaveBeenCalled();
  });

  it('does not run a queued change after its owner unloads', async () => {
    const first = deferred();
    const saveData = vi.fn(() => first.promise);
    const store = new Store({ loadData: async () => null, saveData } as unknown as Plugin);
    await store.load();
    let stopped = false;
    const one = store.update((data) => {
      data.showTooltips = false;
    });
    const change = vi.fn();
    const two = store.update(change, () => stopped);
    await Promise.resolve();
    stopped = true;
    first.resolve();
    await one;
    expect(await two).toBe(false);
    expect(change).not.toHaveBeenCalled();
    expect(saveData).toHaveBeenCalledTimes(1);
  });
});

afterEach(() => vi.restoreAllMocks());

it('localizes its own damaged-data error and preserves host failure details', async () => {
  vi.spyOn(obsidian, 'getLanguage').mockReturnValue('ru');
  const saveData = vi.fn();
  const damaged = new Store({
    loadData: async () => ({ buttons: 'damaged' }),
    saveData,
  } as unknown as Plugin);
  await damaged.load();
  expect(reportError).toHaveBeenCalledWith(
    new Error(
      'Сохранённые данные повреждены; запись отключена до исправления файла и перезагрузки плагина',
    ),
    'Загрузка раскладок',
  );
  await expect(damaged.update(() => undefined)).resolves.toBe(false);
  expect(saveData).not.toHaveBeenCalled();

  const error = new Error('EACCES: permission denied');
  const unavailable = new Store({
    loadData: async () => {
      throw error;
    },
    saveData,
  } as unknown as Plugin);
  await unavailable.load();
  expect(reportError).toHaveBeenCalledWith(
    error,
    'Загрузка раскладок; запись отключена до перезагрузки плагина',
  );

  const writable = new Store({
    loadData: async () => null,
    saveData: vi.fn().mockRejectedValue(error),
  } as unknown as Plugin);
  await writable.load();
  await expect(writable.update(() => undefined)).resolves.toBe(false);
  expect(reportError).toHaveBeenCalledWith(error, 'Сохранение раскладок');
});

it.each(['left', 'right'] as const)(
  'requires an explicit per-button opt-in to stay visible when the %s sidebar closes',
  (side) => {
    for (const shape of [
      { kind: 'layout', placement: 'header', saved: { home: 'outline', floors: [] } },
      { kind: 'command', placement: 'header', commandId: 'app:open-settings' },
    ]) {
      for (const value of [undefined, false, null, 'true', 1, {}]) {
        expect(
          readButton({ id: 'button', side, ...shape, showWhenCollapsed: value }),
        ).toMatchObject({ side, showWhenCollapsed: false });
      }
      const data = readData({
        buttons: [
          { id: 'pinned', side, ...shape, showWhenCollapsed: true },
          { id: 'default', side, ...shape },
        ],
      });
      const restored = readData(JSON.parse(JSON.stringify(data)));
      expect(
        restored.buttons.map(({ id, showWhenCollapsed }) => ({ id, showWhenCollapsed })),
      ).toEqual([
        { id: 'pinned', showWhenCollapsed: true },
        { id: 'default', showWhenCollapsed: false },
      ]);
    }
  },
);
