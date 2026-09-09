import {
  type App,
  Modal,
  type Plugin,
  Setting,
  type SettingDefinitionList,
  type SettingDefinitionPage,
  type SettingGroup,
} from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SettingsHost } from '../../src/controller';
import { type Button, DEFAULT_DATA, type LayoutButton } from '../../src/model';
import { IconSuggest } from '../../src/ui/modals';
import { SidebarLayoutsSettingTab } from '../../src/ui/settings';
import { required } from './required';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
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
  let buttons: Button[] = [layout('Research'), layout('Writing')];
  const host = {
    side: 'right',
    apply: vi.fn(async () => {}),
    capture: vi.fn(() => ({ home: 'outline', floors: [] })),
    app: { workspace: { getLeavesOfType: () => [] } } as unknown as App,
    get data() {
      return { ...DEFAULT_DATA, buttons };
    },
    edit: vi.fn(async (id: string, change: (button: Button) => Button) => {
      buttons = buttons.map((button) => (button.id === id ? change(button) : button));
    }),
    moveTo: vi.fn(async (from: number, to: number) => {
      const next = [...buttons];
      const moved = required(next.splice(from, 1)[0]);
      next.splice(to, 0, moved);
      buttons = next;
    }),
    remove: vi.fn(async (id: string) => {
      buttons = buttons.filter((button) => button.id !== id);
    }),
    createLayout: vi.fn((onAdded: () => void) => {
      buttons = [...buttons, layout('New layout')];
      onAdded();
    }),
    addCommand: vi.fn((onAdded: () => void) => {
      buttons = [
        ...buttons,
        {
          id: 'command',
          name: 'Run command',
          kind: 'command',
          placement: 'header',
          showWhenCollapsed: false,
          side: 'right',
          icon: 'command',
          visible: true,
          commandId: 'command:run',
        },
      ];
      onAdded();
    }),
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
  const refresh = vi.spyOn(tab, 'update');
  const opening = vi.spyOn(Modal.prototype, 'open');
  cleanups.push(() => {
    for (const modal of opening.mock.contexts) if (modal instanceof Modal) modal.close();
  });
  return { host, tab, refresh, opened: () => opening.mock.contexts };
}
function byText(root: ParentNode, text: string): HTMLButtonElement {
  return required(
    [...root.querySelectorAll('button')].find((button) => button.textContent === text),
  );
}
function labelled(root: ParentNode, label: string): HTMLButtonElement {
  return required(
    [...root.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === label,
    ),
  );
}
function management(tab: SidebarLayoutsSettingTab): HTMLElement {
  const side = required(tab.getSettingDefinitions()[1]);
  if (!('items' in side)) throw new Error('Missing side settings page');
  const group = required(side.items?.[0]);
  if (!('items' in group)) throw new Error('Missing management settings group');
  const row = required(group.items?.[0]);
  if (!('render' in row)) throw new Error('Missing management setting renderer');
  const container = document.body.createDiv();
  row.render?.(new Setting(container), {} as SettingGroup);
  byText(container, 'Edit buttons').click();
  return required(document.querySelector<HTMLElement>('.sl-manage-modal'));
}
function displayedNames(root: ParentNode): string[] {
  return [...root.querySelectorAll<HTMLInputElement>('.sl-manage-row input')].map(
    (input) => input.value,
  );
}

describe('settings to native modal and Preact management wiring', () => {
  it('persists rename, reorder, removal and additions through the current host and refreshes the settings tab', async () => {
    const h = harness();
    const modal = management(h.tab);
    expect(displayedNames(modal)).toEqual(['Research', 'Writing']);
    const input = required(modal.querySelector<HTMLInputElement>('input'));
    input.value = 'Reading';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => expect(h.host.data.buttons[0]?.name).toBe('Reading'));
    await vi.waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(labelled(modal, 'Move Reading down').disabled).toBe(false));
    labelled(modal, 'Move Reading down').click();
    await vi.waitFor(() => expect(displayedNames(modal)).toEqual(['Writing', 'Reading']));
    expect(h.host.moveTo).toHaveBeenCalledWith(0, 1);
    expect(h.refresh).toHaveBeenCalledTimes(2);
    labelled(modal, 'Delete Writing').click();
    await vi.waitFor(() => expect(displayedNames(modal)).toEqual(['Reading']));
    expect(h.host.remove).toHaveBeenCalledWith('Writing');
    expect(h.refresh).toHaveBeenCalledTimes(3);
    byText(modal, 'Save current layout').click();
    await vi.waitFor(() => expect(displayedNames(modal)).toEqual(['Reading', 'New layout']));
    expect(h.host.createLayout).toHaveBeenCalledOnce();
    expect(h.refresh).toHaveBeenCalledTimes(4);
    byText(modal, 'Add command').click();
    await vi.waitFor(() =>
      expect(displayedNames(modal)).toEqual(['Reading', 'New layout', 'Run command']),
    );
    expect(h.host.addCommand).toHaveBeenCalledOnce();
    expect(h.refresh).toHaveBeenCalledTimes(5);
    const list = h.tab
      .getSettingDefinitions()
      .flatMap((item) =>
        'type' in item && item.type === 'page' && item.name === 'Right sidebar'
          ? (item.items ?? [])
          : [],
      )
      .find((item) => 'type' in item && item.type === 'list') as SettingDefinitionList;
    expect((list.items as SettingDefinitionPage[]).map((page) => page.name)).toEqual([
      'Reading',
      'New layout',
      'Run command',
    ]);
  });

  it('opens the real icon picker from a rendered setting and applies its chosen icon by stable identity', async () => {
    const h = harness();
    const list = h.tab
      .getSettingDefinitions()
      .flatMap((item) =>
        'type' in item && item.type === 'page' && item.name === 'Right sidebar'
          ? (item.items ?? [])
          : [],
      )
      .find((item) => 'type' in item && item.type === 'list') as SettingDefinitionList;
    const page = required((list.items as SettingDefinitionPage[])[0]);
    const row = required(page.items?.find((item) => 'name' in item && item.name === 'Icon'));
    if (!('render' in row)) throw new Error('Missing icon setting renderer');
    const container = document.body.createDiv();
    row.render?.(new Setting(container), {} as SettingGroup);
    byText(container, 'Change').click();
    const picker = required(h.opened()[0]);
    if (!(picker instanceof IconSuggest)) throw new Error('Icon picker was not opened');
    await h.host.moveTo(0, 1);
    picker.onChooseItem('lucide-moon');
    await vi.waitFor(() =>
      expect(h.host.data.buttons.find((button) => button.id === 'Research')?.icon).toBe(
        'lucide-moon',
      ),
    );
    expect(h.host.data.buttons.find((button) => button.id === 'Writing')?.icon).toBe('star');
    expect(h.refresh).toHaveBeenCalledOnce();
    const updated = document.body.createDiv();
    row.render?.(new Setting(updated), {} as SettingGroup);
    expect(updated.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('lucide-moon');
  });
});
