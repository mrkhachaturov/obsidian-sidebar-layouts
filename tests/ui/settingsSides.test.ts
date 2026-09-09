import * as obsidian from 'obsidian';
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
import { type Button, DEFAULT_DATA, type SidebarSide } from '../../src/model';
import { SidebarLayoutsSettingTab } from '../../src/ui/settings';
import { required } from './required';

const app = { workspace: { getLeavesOfType: () => [] } } as unknown as App;
function layout(side: SidebarSide, id: string): Button {
  return {
    side,
    id,
    name: id,
    kind: 'layout',
    placement: 'header',
    showWhenCollapsed: false,
    icon: 'star',
    visible: true,
    saved: { home: 'outline', floors: [] },
    registerCommand: true,
    fullWidthNotes: false,
  };
}
function host(side: SidebarSide, initial: Button[]) {
  let buttons = initial;
  return {
    side,
    app,
    get data() {
      return { ...DEFAULT_DATA, buttons };
    },
    apply: vi.fn(async () => {}),
    capture: vi.fn(),
    createLayout: vi.fn(),
    addCommand: vi.fn(),
    edit: vi.fn(),
    setFlag: vi.fn(),
    remove: vi.fn(async () => {}),
    moveTo: vi.fn(async () => {}),
    replace: (next: Button[]) => {
      buttons = next;
    },
  };
}
function harness() {
  const left = host('left', [layout('left', 'Files'), layout('left', 'Bookmarks')]);
  const right = host('right', [
    layout('right', 'Research'),
    {
      side: 'right',
      id: 'cmd',
      name: 'Search',
      kind: 'command',
      placement: 'header',
      showWhenCollapsed: false,
      commandId: 'search',
      icon: 'search',
      visible: false,
    },
  ]);
  const tab = new SidebarLayoutsSettingTab(
    { left, right } as unknown as Record<SidebarSide, SettingsHost>,
    {} as Plugin,
  );
  const pages = tab
    .getSettingDefinitions()
    .filter((item): item is SettingDefinitionPage => 'type' in item && item.type === 'page');
  return { tab, left, right, pages };
}
function list(page: SettingDefinitionPage): SettingDefinitionList {
  return required(
    page.items?.find(
      (item): item is SettingDefinitionList => 'type' in item && item.type === 'list',
    ),
  );
}
function renderAction(page: SettingDefinitionPage, name: string): HTMLElement {
  const group = required(page.items?.find((item) => 'heading' in item));
  if (!('items' in group)) throw new Error('No group');
  const row = required(group.items?.find((item) => 'name' in item && item.name === name));
  const root = document.body.createDiv();
  if ('render' in row) row.render?.(new Setting(root), {} as SettingGroup);
  return root;
}
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
describe('independent sidebar settings pages', () => {
  it('navigates separate pages with useful counts without applying or capturing a layout', () => {
    const h = harness();
    expect(h.pages.map((page) => [page.name, page.desc])).toEqual([
      ['Left sidebar', '2 layouts · 0 commands'],
      ['Right sidebar', '1 layout · 1 command'],
    ]);
    expect(
      (list(required(h.pages[0])).items as SettingDefinitionPage[]).map((page) => page.name),
    ).toEqual(['Files', 'Bookmarks']);
    expect(
      (list(required(h.pages[1])).items as SettingDefinitionPage[]).map((page) => page.name),
    ).toEqual(['Research', 'Search']);
    expect(h.left.apply).not.toHaveBeenCalled();
    expect(h.right.apply).not.toHaveBeenCalled();
    expect(h.left.capture).not.toHaveBeenCalled();
    expect(h.right.capture).not.toHaveBeenCalled();
    expect(
      h.tab
        .getSettingDefinitions()
        .filter((item) => 'heading' in item && item.heading === 'Appearance'),
    ).toHaveLength(1);
    h.left.replace([]);
    expect(required(h.pages[0]).desc).toBe('0 layouts · 0 commands');
    expect(list(required(h.pages[0])).emptyState).toContain('left sidebar');
  });
  it('keeps stale reorder callbacks within their original side and resolves displayed identities', () => {
    const h = harness();
    const leftList = list(required(h.pages[0]));
    void leftList.items;
    h.left.replace([layout('left', 'New'), layout('left', 'Files'), layout('left', 'Bookmarks')]);
    leftList.onReorder?.(0, 1);
    expect(h.left.moveTo).toHaveBeenCalledWith(1, 2);
    expect(h.right.moveTo).not.toHaveBeenCalled();
    h.left.replace([layout('left', 'Bookmarks')]);
    h.left.moveTo.mockClear();
    leftList.onReorder?.(0, 1);
    expect(h.left.moveTo).not.toHaveBeenCalled();
  });
  it('routes creation to the selected side and opens a scoped real management editor', () => {
    const h = harness();
    const opening = vi.spyOn(Modal.prototype, 'open');
    const controls = renderAction(required(h.pages[0]), 'Buttons');
    for (const name of ['Save current layout', 'Add command', 'Edit buttons']) {
      required(
        [...controls.querySelectorAll('button')].find((button) => button.textContent === name),
      ).click();
    }
    expect(h.left.createLayout).toHaveBeenCalledOnce();
    expect(h.left.addCommand).toHaveBeenCalledOnce();
    expect(h.right.createLayout).not.toHaveBeenCalled();
    expect(h.right.addCommand).not.toHaveBeenCalled();
    const modal = required(opening.mock.contexts[0]);
    if (!(modal instanceof Modal)) throw new Error('Missing management modal');
    expect(modal.modalEl.textContent).toContain('Left sidebar buttons');
    expect(
      [...modal.contentEl.querySelectorAll<HTMLInputElement>('.sl-manage-name')].map(
        (input) => input.value,
      ),
    ).toEqual(['Files', 'Bookmarks']);
    modal.close();
  });
  it('previews visible icons in actual order using non-interactive accessible elements', () => {
    const h = harness();
    const page = required(h.pages[1]);
    const row = required(
      page.items?.find((item) => 'name' in item && item.name === 'Button preview'),
    );
    const root = document.body.createDiv();
    if ('render' in row) row.render?.(new Setting(root), {} as SettingGroup);
    const preview = required(root.querySelector('[role="list"]'));
    expect(preview.getAttribute('aria-label')).toBe('Right sidebar button preview');
    expect(
      [...preview.querySelectorAll('[role="listitem"]')].map((item) =>
        item.getAttribute('aria-label'),
      ),
    ).toEqual(['Research · Layout']);
    expect(preview.querySelector('button, [role="button"], [tabindex]')).toBeNull();
    expect((list(page).items as SettingDefinitionPage[])[1]?.desc).toContain('Command · Hidden');
  });
});

describe('Russian settings pages', () => {
  it('localizes both native pages, descriptions, controls, previews and empty states', () => {
    vi.spyOn(obsidian, 'getLanguage').mockReturnValue('ru-RU');
    const h = harness();
    expect(h.pages.map((page) => [page.name, page.desc])).toEqual([
      ['Левая боковая панель', '2 раскладки · 0 команд'],
      ['Правая боковая панель', '1 раскладка · 1 команда'],
    ]);
    for (const [index, side] of [
      [0, 'левой'],
      [1, 'правой'],
    ] as const) {
      const page = required(h.pages[index]);
      const controls = renderAction(page, 'Кнопки');
      expect([...controls.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
        'Сохранить текущую раскладку',
        'Добавить команду',
        'Редактировать кнопки',
      ]);
      expect(list(page).emptyState).toContain(`На ${side} боковой панели пока нет кнопок.`);
      const previewRow = required(
        page.items?.find((item) => 'name' in item && item.name === 'Предпросмотр кнопок'),
      );
      const root = document.body.createDiv();
      if ('render' in previewRow) previewRow.render?.(new Setting(root), {} as SettingGroup);
      expect(root.querySelector('[role="list"]')?.getAttribute('aria-label')).toBe(
        `Предпросмотр кнопок ${side} боковой панели`,
      );
      const buttonPage = required((list(page).items as SettingDefinitionPage[])[0]);
      expect(buttonPage.name).toBe(index === 0 ? 'Files' : 'Research');
      const rows = required(buttonPage.items);
      expect(
        rows.filter((row) => 'name' in row).map((row) => ('name' in row ? row.name : '')),
      ).toContain('Применить раскладку');
      const position = required(
        rows.find((row) => 'name' in row && row.name === 'Расположение кнопки'),
      );
      if (!('control' in position) || position.control.type !== 'dropdown')
        throw new Error('Missing position dropdown');
      expect(position.control.options).toEqual({
        header: 'В верхней области окна',
        panel: 'Под вкладками панели',
      });
      expect(rows).toContainEqual(
        expect.objectContaining({
          name: 'Показывать при закрытой боковой панели',
          desc: 'Оставлять эту кнопку в верхней области окна, когда её боковая панель закрыта.',
        }),
      );
      const apply = required(
        rows.find((row) => 'name' in row && row.name === 'Применить раскладку'),
      );
      expect('desc' in apply ? apply.desc : '').toContain(
        index === 0 ? 'левой боковой панели' : 'правой боковой панели',
      );
    }
    expect(
      h.tab
        .getSettingDefinitions()
        .filter((item) => 'heading' in item && item.heading === 'Внешний вид'),
    ).toHaveLength(1);
  });
});

describe('separate header and panel previews', () => {
  it('groups positions while preserving the side list order and excluding hidden buttons', () => {
    const h = harness();
    const page = required(h.pages[0]);
    h.left.replace([
      { ...layout('left', 'Panel A'), placement: 'panel' },
      layout('left', 'Header A'),
      { ...layout('left', 'Panel B'), placement: 'panel' },
      layout('left', 'Header B'),
      { ...layout('left', 'Hidden'), placement: 'panel', visible: false },
    ]);
    const row = required(
      page.items?.find((item) => 'name' in item && item.name === 'Button preview'),
    );
    const root = document.body.createDiv();
    if ('render' in row) row.render?.(new Setting(root), {} as SettingGroup);
    const names = (placement: string) =>
      [...root.querySelectorAll(`[data-placement="${placement}"] [role="listitem"]`)].map((item) =>
        item.getAttribute('aria-label'),
      );
    expect(names('header')).toEqual(['Header A · Layout', 'Header B · Layout']);
    expect(names('panel')).toEqual(['Panel A · Layout', 'Panel B · Layout']);
    expect(root.textContent).toContain('In the window header');
    expect(root.textContent).toContain('Below panel tabs');
    expect(root.textContent).not.toContain('Research');
    expect((list(page).items as SettingDefinitionPage[]).map((button) => button.name)).toEqual([
      'Panel A',
      'Header A',
      'Panel B',
      'Header B',
      'Hidden',
    ]);
  });
});
