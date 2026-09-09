import type { Plugin } from 'obsidian';
import * as obsidian from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ButtonRow, type RowItem, sidebarDocument } from '../../src/ui/buttons';
import { watchTopTab } from '../../src/ui/topTabWatcher';
import { installOwnerHelpers, required } from './required';

function host(doc = document) {
  installOwnerHelpers(doc);
  const root = doc.body.createDiv();
  const container = root.createDiv({ cls: 'workspace-tab-header-container' });
  const strip = container.createDiv({ cls: 'workspace-tab-header-container-inner' });
  strip.createDiv({ cls: 'workspace-tab-header is-active', attr: { 'data-type': 'outline' } });
  const leftRoot = doc.body.createDiv();
  const leftHeader = leftRoot.createDiv({ cls: 'workspace-tab-header-container' });
  leftHeader.createDiv({ cls: 'workspace-tab-header-container-inner' }).createDiv({
    cls: 'workspace-tab-header is-active',
    attr: { 'data-type': 'file-explorer' },
  });
  const rightToggle = container.createDiv({ cls: 'sidebar-toggle-button mod-right' });
  const leftToggle = leftHeader.createDiv({ cls: 'sidebar-toggle-button mod-left' });
  const cleanups: (() => void)[] = [];
  const ready: (() => void)[] = [];
  const events = new Map<string, Set<() => void>>();
  const plugin = {
    app: {
      workspace: {
        rightSidebarToggleButtonEl: rightToggle,
        leftSidebarToggleButtonEl: leftToggle,
        rightSplit: { containerEl: root, collapsed: false },
        leftSplit: { containerEl: leftRoot, collapsed: false },
        onLayoutReady: (callback: () => void) => ready.push(callback),
        on: (name: string, callback: () => void) => {
          const callbacks = events.get(name) ?? new Set();
          callbacks.add(callback);
          events.set(name, callbacks);
          return { name };
        },
      },
    },
    register: (cleanup: () => void) => cleanups.push(cleanup),
    registerEvent: (event: { name: string }) =>
      cleanups.push(() => {
        events.delete(event.name);
      }),
  } as unknown as Plugin;
  return {
    plugin,
    root,
    leftRoot,
    leftToggle,
    rightToggle,
    ready: () =>
      ready.forEach((callback) => {
        callback();
      }),
    change: () =>
      events.get('layout-change')?.forEach((callback) => {
        callback();
      }),
    frameChange: () =>
      events.get('window-frame-change')?.forEach((callback) => {
        callback();
      }),
    unload: () =>
      cleanups
        .splice(0)
        .reverse()
        .forEach((cleanup) => {
          cleanup();
        }),
    events,
  };
}
function item(key: string): RowItem {
  return {
    key,
    icon: 'star',
    label: `Layout ${key}`,
    active: false,
    placement: 'header',
    showWhenCollapsed: false,
    onClick: vi.fn(),
    onMenu: vi.fn(),
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('sidebar button lifecycle and ownership', () => {
  it('draws native keyboard-focusable buttons, keeps an accessible name with tooltips disabled, and updates callbacks without rebuilding', () => {
    const h = host();
    let rows = [item('a')];
    let tooltips = false;
    const row = new ButtonRow(
      h.plugin,
      () => rows,
      () => tooltips,
    );
    row.start();
    h.ready();
    const button = required(h.root.querySelector('button'));
    expect(button.type).toBe('button');
    expect(button.tabIndex).toBe(0);
    const labelId = required(button.getAttribute('aria-labelledby'));
    expect(document.getElementById(labelId)?.textContent).toBe('Layout a');
    expect(button.hasAttribute('aria-label')).toBe(false);
    const next = item('a');
    rows = [{ ...next, active: true }];
    tooltips = true;
    row.sync();
    button.click();
    expect(h.root.querySelector('button')).toBe(button);
    expect(next.onClick).toHaveBeenCalledOnce();
    expect(button.getAttribute('aria-label')).toBe('Layout a');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.hasAttribute('aria-labelledby')).toBe(false);
    button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(next.onMenu).toHaveBeenCalledOnce();
    h.unload();
    expect(h.root.querySelector('button')).toBeNull();
  });

  it('ignores layout-ready after unload and removes buttons when their container disappears', () => {
    const h = host();
    const row = new ButtonRow(
      h.plugin,
      () => [item('a')],
      () => true,
    );
    row.start();
    row.start();
    h.unload();
    h.ready();
    row.sync();
    expect(h.root.querySelector('button')).toBeNull();
    expect(h.events.size).toBe(0);
    const live = host();
    const active = new ButtonRow(
      live.plugin,
      () => [item('a')],
      () => true,
    );
    active.start();
    live.ready();
    const button = required(live.root.querySelector('button'));
    live.root.replaceChildren();
    active.sync();
    expect(button.parentElement).toBeNull();
    live.unload();
  });

  it('uses the right-sidebar document even while an unrelated main document has a matching strip', () => {
    const wrong = host();
    const frame = document.body.createEl('iframe');
    const doc = required(frame.contentDocument);
    const h = host(doc);
    const row = new ButtonRow(
      h.plugin,
      () => [item('a'), item('b')],
      () => false,
    );
    row.start();
    h.ready();
    expect(sidebarDocument(h.plugin.app)).toBe(doc);
    expect(wrong.root.querySelector('button')).toBeNull();
    expect(h.root.querySelectorAll('button')).toHaveLength(2);
    expect(h.root.querySelector('button')?.ownerDocument).toBe(doc);
    h.unload();
  });

  it('reorders existing nodes, removes deleted entries, and recovers after a host strip rebuild', () => {
    const h = host();
    let rows = [item('a'), item('b')];
    const row = new ButtonRow(
      h.plugin,
      () => rows,
      () => true,
    );
    row.start();
    h.ready();
    const first = h.root.querySelector('button');
    rows.reverse();
    row.sync();
    expect(h.root.querySelectorAll('button')[1]).toBe(first);
    h.root.replaceChildren();
    h.root.createDiv({ cls: 'workspace-tab-header-container' }).appendChild(h.rightToggle);
    rows = [required(rows[1])];
    row.sync();
    expect(h.root.querySelector('button')).toBe(first);
    expect(h.root.querySelectorAll('button')).toHaveLength(1);
    h.unload();
  });
});

describe('top tab watcher', () => {
  it('observes tab replacements and type changes, detaches old strips and stops on unload', async () => {
    const h = host();
    const changed = vi.fn();
    watchTopTab(h.plugin, changed);
    h.ready();
    required(h.root.querySelector('.is-active')).setAttribute('data-type', 'backlink');
    await Promise.resolve();
    expect(changed).toHaveBeenLastCalledWith('backlink');
    h.root.replaceChildren();
    h.change();
    expect(changed).toHaveBeenLastCalledWith(null);
    const replacement = h.root.createDiv({ cls: 'workspace-tab-header-container-inner' });
    replacement.createDiv({
      cls: 'workspace-tab-header is-active',
      attr: { 'data-type': 'search' },
    });
    h.change();
    expect(changed).toHaveBeenLastCalledWith('search');
    h.unload();
    changed.mockClear();
    required(h.root.querySelector('.is-active')).setAttribute('data-type', 'tag');
    await Promise.resolve();
    expect(changed).not.toHaveBeenCalled();
  });
  it('uses the sidebar window observer and ignores matching strips in another window', async () => {
    const unrelated = host();
    const frame = document.body.createEl('iframe');
    const sidebar = host(required(frame.contentDocument));
    const changed = vi.fn();
    watchTopTab(sidebar.plugin, changed);
    sidebar.ready();
    required(unrelated.root.querySelector('.is-active')).setAttribute('data-type', 'search');
    await Promise.resolve();
    expect(changed).not.toHaveBeenCalled();
    required(sidebar.root.querySelector('.is-active')).setAttribute('data-type', 'tag');
    await Promise.resolve();
    expect(changed).toHaveBeenCalledExactlyOnceWith('tag');
    sidebar.unload();
  });
  it('does not attach from delayed layout-ready after unloading', () => {
    const h = host();
    const changed = vi.fn();
    watchTopTab(h.plugin, changed);
    h.unload();
    h.ready();
    expect(h.events.size).toBe(0);
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('independent sidebar rows and overflow', () => {
  it('keeps buttons beside native toggles on their own side, and only watches that side', async () => {
    const h = host();
    const left = item('left');
    const right = item('right');
    const leftRow = new ButtonRow(
      h.plugin,
      () => [left],
      () => true,
      'left',
    );
    const rightRow = new ButtonRow(
      h.plugin,
      () => [right],
      () => true,
      'right',
    );
    const leftChange = vi.fn();
    const rightChange = vi.fn();
    leftRow.start();
    rightRow.start();
    watchTopTab(h.plugin, leftChange, 'left');
    watchTopTab(h.plugin, rightChange, 'right');
    h.ready();
    expect(h.leftRoot.querySelector('button')?.getAttribute('aria-label')).toBe('Layout left');
    expect(h.root.querySelector('button')?.getAttribute('aria-label')).toBe('Layout right');
    expect(h.leftToggle.parentElement?.firstElementChild).toBe(
      h.leftRoot.querySelector('.sl-button-strip'),
    );
    required(h.leftRoot.querySelector('button')).click();
    expect(left.onClick).toHaveBeenCalledOnce();
    expect(right.onClick).not.toHaveBeenCalled();
    required(h.leftRoot.querySelector('.is-active')).setAttribute('data-type', 'search');
    await Promise.resolve();
    expect(leftChange).toHaveBeenCalledExactlyOnceWith('search');
    expect(rightChange).not.toHaveBeenCalled();
    h.unload();
    expect(h.leftRoot.querySelector('.sl-button-strip')).toBeNull();
    expect(h.root.querySelector('.sl-button-strip')).toBeNull();
  });

  it('moves overflow actions into a menu in current order and restores them when resized', () => {
    const h = host();
    let width = 60;
    const disconnect = vi.fn();
    vi.spyOn(window, 'ResizeObserver').mockImplementation(function ResizeObserverMock() {
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect };
    });
    const observer = vi.mocked(window.ResizeObserver);
    const rows = ['a', 'b', 'c'].map((key) => ({ ...item(key), placement: 'panel' as const }));
    const row = new ButtonRow(
      h.plugin,
      () => rows,
      () => true,
    );
    row.start();
    h.ready();
    const strip = required(h.root.querySelector<HTMLElement>('.sl-button-strip'));
    Object.defineProperty(strip, 'clientWidth', { get: () => width });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 28,
        bottom: 28,
        width: 28,
        height: 28,
        toJSON: () => ({}),
      };
    });
    const callback = required(observer.mock.calls[0]?.[0]);
    const resize = () => callback([], { observe: vi.fn(), unobserve: vi.fn(), disconnect });
    resize();
    expect(
      [...strip.querySelectorAll<HTMLButtonElement>('.sl-button')].filter((el) => !el.hidden),
    ).toHaveLength(1);
    required(strip.querySelector<HTMLButtonElement>('.sl-overflow')).click();
    const menuButtons = [...document.querySelectorAll<HTMLButtonElement>('.test-menu button')];
    expect(menuButtons.map((button) => button.textContent)).toEqual(['Layout b', 'Layout c']);
    required(menuButtons[0]).click();
    expect(rows[1]?.onClick).toHaveBeenCalledOnce();
    rows.reverse();
    row.sync();
    expect(
      [...strip.querySelectorAll<HTMLButtonElement>('.sl-button')]
        .filter((el) => !el.hidden)[0]
        ?.getAttribute('aria-label'),
    ).toBe('Layout c');
    width = 160;
    resize();
    expect(strip.querySelector('.sl-overflow')).toBeNull();
    expect(
      [...strip.querySelectorAll<HTMLButtonElement>('.sl-button')].every(
        (button) => !button.hidden,
      ),
    ).toBe(true);
    h.unload();
    expect(disconnect).toHaveBeenCalled();
    resize();
    expect(h.root.querySelector('.sl-button-strip')).toBeNull();
  });
});

it('keeps chosen header buttons beside relocated toggles while panel buttons stay inside their sidebar', () => {
  const h = host();
  const rows: RowItem[] = [
    { ...item('theme'), showWhenCollapsed: true },
    { ...item('layout'), placement: 'panel' },
  ];
  const right = new ButtonRow(
    h.plugin,
    () => rows,
    () => true,
    'right',
  );
  const left = new ButtonRow(
    h.plugin,
    () => [{ ...item('left'), showWhenCollapsed: true }],
    () => true,
    'left',
  );
  right.start();
  left.start();
  h.ready();
  const upper = required(h.root.querySelector<HTMLElement>('.sl-header-buttons'));
  const lower = required(h.root.querySelector<HTMLElement>('.sl-panel-buttons'));
  const leftUpper = required(h.leftRoot.querySelector<HTMLElement>('.sl-header-buttons'));
  expect(h.rightToggle.previousElementSibling).toBe(upper);
  expect(h.root.querySelector('.workspace-tab-header-container')?.nextElementSibling).toBe(lower);
  const centre = document.body.createDiv({ cls: 'workspace-tab-header-container' });
  // Native frame animation leaves clones behind. The live toggle is the anchor.
  h.rightToggle.before(h.rightToggle.cloneNode(true));
  centre.append(h.leftToggle, h.rightToggle);
  h.plugin.app.workspace.rightSplit.collapsed = true;
  h.plugin.app.workspace.leftSplit.collapsed = true;
  h.root.hidden = true;
  h.leftRoot.hidden = true;
  h.frameChange();
  expect(h.rightToggle.previousElementSibling).toBe(upper);
  expect(h.leftToggle.nextElementSibling).toBe(leftUpper);
  expect(upper.parentElement).toBe(centre);
  expect(leftUpper.parentElement).toBe(centre);
  expect(lower.parentElement).toBe(h.root);
  required(upper.querySelector('button')).click();
  expect(rows[0]?.onClick).toHaveBeenCalledOnce();
  required(h.root.querySelector('.workspace-tab-header-container')).appendChild(h.rightToggle);
  h.plugin.app.workspace.rightSplit.collapsed = false;
  h.plugin.app.workspace.leftSplit.collapsed = false;
  h.root.hidden = false;
  required(h.leftRoot.querySelector('.workspace-tab-header-container')).appendChild(h.leftToggle);
  h.leftRoot.hidden = false;
  h.frameChange();
  expect(h.leftToggle.parentElement?.firstElementChild).toBe(leftUpper);
  expect(h.rightToggle.previousElementSibling).toBe(upper);
  expect(h.root.querySelectorAll('.sl-header-buttons')).toHaveLength(1);
  h.unload();
  expect(document.querySelector('.sl-button-strip')).toBeNull();
});

it('moves the same button between placements, removes empty rows, and localizes group labels', () => {
  vi.spyOn(obsidian, 'getLanguage').mockReturnValue('ru');
  const h = host();
  let rows = [item('a')];
  const row = new ButtonRow(
    h.plugin,
    () => rows,
    () => true,
  );
  row.start();
  h.ready();
  const button = required(h.root.querySelector('button'));
  expect(h.root.querySelector('.sl-header-buttons')?.getAttribute('aria-label')).toContain(
    'В верхней области окна',
  );
  rows = [{ ...required(rows[0]), placement: 'panel' }];
  row.sync();
  expect(h.root.querySelector('.sl-header-buttons')).toBeNull();
  expect(h.root.querySelector('.sl-panel-buttons button')).toBe(button);
  expect(h.root.querySelector('.sl-panel-buttons')?.getAttribute('aria-label')).toContain(
    'Под вкладками панели',
  );
  rows = [];
  row.sync();
  expect(h.root.querySelector('.sl-button-strip')).toBeNull();
  h.unload();
});

it.each(['left', 'right'] as const)(
  '%s header keeps every button at narrow widths and only opted-in buttons survive collapse',
  (side) => {
    const h = host();
    let rows = [item('layout'), { ...item('theme'), showWhenCollapsed: true }];
    const row = new ButtonRow(
      h.plugin,
      () => rows,
      () => true,
      side,
    );
    row.start();
    h.ready();
    const root = side === 'left' ? h.leftRoot : h.root;
    const split =
      side === 'left' ? h.plugin.app.workspace.leftSplit : h.plugin.app.workspace.rightSplit;
    const otherSplit =
      side === 'left' ? h.plugin.app.workspace.rightSplit : h.plugin.app.workspace.leftSplit;
    const toggle = side === 'left' ? h.leftToggle : h.rightToggle;
    const header = required(toggle.parentElement);
    const strip = required(root.querySelector<HTMLElement>('.sl-header-buttons'));
    Object.defineProperty(strip, 'clientWidth', { get: () => 1 });
    row.sync();
    expect(strip.querySelectorAll('.sl-button')).toHaveLength(2);
    expect(strip.querySelector('.sl-overflow')).toBeNull();
    expect(
      [...strip.querySelectorAll<HTMLButtonElement>('button')].every((button) => !button.hidden),
    ).toBe(true);
    expect(strip.dataset.side).toBe(side);
    if (side === 'left') expect(header.firstElementChild).toBe(strip);
    else expect(toggle.previousElementSibling).toBe(strip);

    // Closing the opposite sidebar must not filter this row.
    otherSplit.collapsed = true;
    h.change();
    expect(strip.querySelectorAll('.sl-button')).toHaveLength(2);
    const central = document.body.createDiv();
    central.appendChild(toggle);
    split.collapsed = true;
    h.frameChange();
    expect(central.querySelectorAll('.sl-button')).toHaveLength(1);
    expect(central.querySelector('.sl-button')?.getAttribute('aria-label')).toBe('Layout theme');
    if (side === 'left') expect(toggle.nextElementSibling).toBe(strip);
    else expect(toggle.previousElementSibling).toBe(strip);
    row.sync();
    expect(central.querySelectorAll('.sl-header-buttons')).toHaveLength(1);
    if (side === 'left') expect(toggle.nextElementSibling).toBe(strip);
    else expect(toggle.previousElementSibling).toBe(strip);

    // Changing this option while closed removes the row, including its focus targets.
    rows = rows.map((entry) => ({ ...entry, showWhenCollapsed: false }));
    row.sync();
    expect(central.querySelector('.sl-button-strip')).toBeNull();
    expect(document.querySelector('.sl-overflow')).toBeNull();
    header.appendChild(toggle);
    split.collapsed = false;
    h.frameChange();
    expect(root.querySelectorAll('.sl-button')).toHaveLength(2);
    h.unload();
    expect(document.querySelector('.sl-button-strip')).toBeNull();
  },
);
