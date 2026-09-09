import {
  type App,
  type Plugin,
  Setting,
  type SettingDefinitionList,
  type SettingDefinitionPage,
  type SettingGroup,
} from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import type { SettingsHost } from '../../src/controller';
import { type Button, DEFAULT_DATA, type LayoutButton } from '../../src/model';
import { SidebarLayoutsSettingTab } from '../../src/ui/settings';
import { required } from './required';

function layout(id: string): LayoutButton {
  return {
    id,
    side: 'right',
    name: id,
    kind: 'layout',
    placement: 'header',
    showWhenCollapsed: false,
    visible: true,
    icon: 'star',
    saved: { home: 'outline', floors: [] },
    fullWidthNotes: false,
    registerCommand: true,
  };
}
function harness() {
  let buttons: Button[] = [
    layout('a'),
    layout('b'),
    {
      id: 'c',
      name: 'Command',
      kind: 'command',
      placement: 'header',
      showWhenCollapsed: false,
      side: 'right',
      icon: 'x',
      visible: true,
      commandId: 'test:run',
    },
  ];
  const host = {
    side: 'right',
    apply: vi.fn(async () => {}),
    capture: vi.fn(() => ({ home: 'outline', floors: [] })),
    app: { workspace: { getLeavesOfType: () => [] } } as unknown as App,
    get data() {
      return { ...DEFAULT_DATA, buttons };
    },
    setFlag: vi.fn(async () => {}),
    edit: vi.fn(async (id: string, edit: (button: Button) => Button) => {
      buttons = buttons.map((button) => (button.id === id ? edit(button) : button));
    }),
    moveTo: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    promote: vi.fn(async () => {}),
    reset: vi.fn(async () => {}),
  };
  const tab = new SidebarLayoutsSettingTab(
    {
      right: host as unknown as SettingsHost,
      left: {
        ...host,
        side: 'left',
        data: { ...DEFAULT_DATA, buttons: [] },
      } as unknown as SettingsHost,
    },
    {} as Plugin,
  );
  const list = tab
    .getSettingDefinitions()
    .flatMap((item) =>
      'type' in item && item.type === 'page' && item.name === 'Right sidebar'
        ? (item.items ?? [])
        : [],
    )
    .find((item) => 'type' in item && item.type === 'list') as SettingDefinitionList;
  const pages = list.items as SettingDefinitionPage[];
  return {
    tab,
    host,
    list,
    pages,
    replace: (next: Button[]) => {
      buttons = next;
    },
  };
}
describe('native settings contracts', () => {
  it('rejects unknown keys and wrong types without corrupting identity or discriminants', async () => {
    const h = harness();
    for (const key of ['a::kind', 'a::id', 'a::saved', 'a::__proto__', 'name']) {
      expect(h.tab.getControlValue(key)).toBeUndefined();
      await h.tab.setControlValue(key, true);
    }
    await h.tab.setControlValue('a::name', false);
    await h.tab.setControlValue('a::visible', 'yes');
    await h.tab.setControlValue('a::name', '  ');
    await h.tab.setControlValue('hideManagedTabs', 'yes');
    expect(h.host.edit).not.toHaveBeenCalled();
    expect(h.host.setFlag).not.toHaveBeenCalled();
    expect(h.host.data.buttons[0]).toEqual(layout('a'));
  });
  it('edits supported fields, including IDs containing separators, and never adds layout options to commands', async () => {
    const h = harness();
    h.replace([
      layout('a::x'),
      {
        id: 'c',
        name: 'Command',
        kind: 'command',
        placement: 'header',
        showWhenCollapsed: false,
        side: 'right',
        icon: 'x',
        visible: true,
        commandId: 'test:run',
      },
    ]);
    await h.tab.setControlValue('a::x::name', '  Research  ');
    expect(h.tab.getControlValue('a::x::name')).toBe('Research');
    await h.tab.setControlValue('a::x::visible', false);
    await h.tab.setControlValue('a::x::registerCommand', false);
    await h.tab.setControlValue('a::x::fullWidthNotes', true);
    expect(h.tab.getControlValue('a::x::visible')).toBe(false);
    expect(h.tab.getControlValue('a::x::registerCommand')).toBe(false);
    expect(h.tab.getControlValue('a::x::fullWidthNotes')).toBe(true);
    await h.tab.setControlValue('c::fullWidthNotes', true);
    expect(h.host.data.buttons[1]).not.toHaveProperty('fullWidthNotes');
    expect(h.tab.getControlValue('c::registerCommand')).toBeUndefined();
    expect(h.tab.getControlValue('missing::name')).toBeUndefined();
    await h.tab.setControlValue('showTooltips', false);
    expect(h.host.setFlag).toHaveBeenCalledWith('showTooltips', false);
    expect(h.tab.getControlValue('hideManagedTabs')).toBe(true);
  });
  it('resolves row actions by displayed identity when another settings window inserts or deletes entries', () => {
    const h = harness();
    h.replace([layout('new'), layout('a'), layout('b')]);
    h.list.onReorder?.(0, 1);
    expect(h.host.moveTo).toHaveBeenCalledWith(1, 2);
    h.list.onDelete?.(0);
    expect(h.host.remove).toHaveBeenCalledWith('a');
    h.host.moveTo.mockClear();
    h.replace([layout('new'), layout('a')]);
    h.list.onReorder?.(0, 1);
    h.list.onReorder?.(-1, 100);
    expect(h.host.moveTo).not.toHaveBeenCalled();
    expect(h.list.items).toHaveLength(2);
  });
  it('reads names, shape descriptions, warning status and action rows from current state', () => {
    const h = harness();
    const page = required(h.pages[0]);
    expect(page.name).toBe('a');
    expect(typeof page.status === 'function' ? page.status() : page.status).toBeNull();
    h.replace([{ ...layout('a'), name: 'Renamed', working: { home: 'backlink', floors: [] } }]);
    expect(page.name).toBe('Renamed');
    expect(page.desc).toBe('Layout · Modified · Backlink');
    expect(typeof page.status === 'function' ? page.status() : page.status).toBe('warning');
    const rows = required(page.items);
    const description = rows.find((row) => 'name' in row && row.name === 'Saved layout');
    expect(description !== undefined && 'desc' in description ? description.desc : undefined).toBe(
      'Outline',
    );
    for (const name of ['Save changes', 'Restore saved layout']) {
      const row = rows.find((entry) => 'name' in entry && entry.name === name);
      if (row !== undefined && 'action' in row) row.action?.(document.body.createDiv(), 0);
    }
    expect(h.host.promote).toHaveBeenCalledWith('a');
    expect(h.host.reset).toHaveBeenCalledWith('a');
    h.replace([]);
    expect(page.name).toBe('Button removed');
    expect(page.desc).toBe('');
    expect(typeof page.status === 'function' ? page.status() : page.status).toBeNull();
    expect(page.items).toEqual([]);
  });
  it('renders the latest icon and avoids stale controls for a removed button', () => {
    const h = harness();
    const page = required(h.pages[0]);
    const iconRow = required(
      required(page.items).find((row) => 'name' in row && row.name === 'Icon'),
    );
    h.replace([{ ...layout('a'), icon: 'moon' }]);
    const root = document.body.createDiv();
    if ('render' in iconRow) iconRow.render?.(new Setting(root), {} as SettingGroup);
    expect(root.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('moon');
    h.replace([]);
    const empty = document.body.createDiv();
    if ('render' in iconRow) iconRow.render?.(new Setting(empty), {} as SettingGroup);
    expect(empty.querySelector('button')).toBeNull();
  });
});

describe('per-button placement controls', () => {
  it('reads and writes both placements for layouts and commands and rejects invalid values', async () => {
    const h = harness();
    expect(h.tab.getControlValue('a::placement')).toBe('header');
    expect(h.tab.getControlValue('c::placement')).toBe('header');
    await h.tab.setControlValue('a::placement', 'panel');
    await h.tab.setControlValue('c::placement', 'panel');
    expect(h.tab.getControlValue('a::placement')).toBe('panel');
    expect(h.tab.getControlValue('c::placement')).toBe('panel');
    await h.tab.setControlValue('a::placement', 'header');
    expect(h.tab.getControlValue('a::placement')).toBe('header');
    h.host.edit.mockClear();
    for (const value of [true, false, 1, null, '', 'left', 'bottom', 'HEADER', {}]) {
      await h.tab.setControlValue('a::placement', value);
      await h.tab.setControlValue('c::placement', value);
    }
    expect(h.host.edit).not.toHaveBeenCalled();
    expect(h.tab.getControlValue('a::placement')).toBe('header');
    expect(h.tab.getControlValue('c::placement')).toBe('panel');
  });
  it('declares stable native dropdown values and explains the closed-sidebar behavior', () => {
    const h = harness();
    for (const [index, page] of h.pages.entries()) {
      const row = required(
        page.items?.find((item) => 'name' in item && item.name === 'Button position'),
      );
      if (!('control' in row)) throw new Error('Missing position control');
      expect(row.control).toEqual({
        type: 'dropdown',
        key: `${['a', 'b', 'c'][index]}::placement`,
        options: { header: 'In the window header', panel: 'Below panel tabs' },
      });
      expect(row.desc).toBe('Buttons below panel tabs hide with the sidebar.');
    }
  });
});

describe('per-button closed sidebar visibility', () => {
  it('offers an independent opt-in for each header layout and command', async () => {
    const h = harness();
    const update = vi.spyOn(h.tab, 'update');
    for (const id of ['a', 'c']) {
      expect(h.tab.getControlValue(`${id}::showWhenCollapsed`)).toBe(false);
      await h.tab.setControlValue(`${id}::showWhenCollapsed`, true);
      expect(h.tab.getControlValue(`${id}::showWhenCollapsed`)).toBe(true);
    }
    expect(h.tab.getControlValue('b::showWhenCollapsed')).toBe(false);
    await h.tab.setControlValue('a::showWhenCollapsed', false);
    expect(h.tab.getControlValue('a::showWhenCollapsed')).toBe(false);
    expect(h.tab.getControlValue('c::showWhenCollapsed')).toBe(true);
    h.host.edit.mockClear();
    for (const value of ['true', 1, null, undefined, {}]) {
      await h.tab.setControlValue('a::showWhenCollapsed', value);
      await h.tab.setControlValue('c::showWhenCollapsed', value);
    }
    expect(h.host.edit).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('refreshes the conditional toggle after placement changes and preserves the preference', async () => {
    const h = harness();
    const update = vi.spyOn(h.tab, 'update');
    for (const [index, id] of [
      [0, 'a'],
      [2, 'c'],
    ] as const) {
      const page = required(h.pages[index]);
      const toggle = () =>
        page.items?.find(
          (item) => 'control' in item && item.control.key === `${id}::showWhenCollapsed`,
        );
      expect(toggle()).toMatchObject({
        name: 'Show when sidebar is closed',
        control: { type: 'toggle', key: `${id}::showWhenCollapsed` },
      });
      await h.tab.setControlValue(`${id}::showWhenCollapsed`, true);
      await h.tab.setControlValue(`${id}::placement`, 'panel');
      expect(toggle()).toBeUndefined();
      expect(h.tab.getControlValue(`${id}::showWhenCollapsed`)).toBe(true);
      await h.tab.setControlValue(`${id}::placement`, 'header');
      expect(toggle()).toBeDefined();
      expect(h.tab.getControlValue(`${id}::showWhenCollapsed`)).toBe(true);
    }
    expect(update).toHaveBeenCalledTimes(4);
    update.mockClear();
    await h.tab.setControlValue('a::name', 'Renamed');
    expect(update).not.toHaveBeenCalled();
  });
});
