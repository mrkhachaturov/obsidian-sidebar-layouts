import { DragDropManager } from '@dnd-kit/dom';
import { Sortable } from '@dnd-kit/dom/sortable';
import * as obsidian from 'obsidian';
/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import type { App } from 'obsidian';
import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Button } from '../../src/model';
import { ManageButtons } from '../../src/ui/ManageButtons';
import { type ManageActions, ManageButtonsModal } from '../../src/ui/manageModal';
import { mountIsland } from '../../src/ui/mountIsland';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
});
const settle = (): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, 0));
function command(id: string): Button {
  return {
    id,
    name: id.toUpperCase(),
    icon: 'command',
    kind: 'command',
    placement: 'header',
    showWhenCollapsed: false,
    side: 'right',
    commandId: id,
    visible: true,
  };
}
function draw(ids = ['a', 'b', 'c'], owner = document) {
  let current = ids.map(command);
  const actions: ManageActions = {
    side: 'right',
    list: () => current,
    rename: vi.fn(async (id: string, name: string) => {
      current = current.map((button) => (button.id === id ? { ...button, name } : button));
    }),
    move: vi.fn(async (from: number, to: number) => {
      const [item] = current.splice(from, 1);
      if (item !== undefined) current.splice(to, 0, item);
    }),
    remove: vi.fn(async (id: string) => {
      current = current.filter((button) => button.id !== id);
    }),
    addLayout: vi.fn(),
    addCommand: vi.fn(),
  };
  const el = owner.body.createDiv();
  render(<ManageButtons actions={actions} />, el);
  cleanups.push(() => {
    render(null, el);
    el.remove();
  });
  return {
    el,
    actions,
    replace: (ids: string[]) => {
      current = ids.map(command);
    },
  };
}
function control(el: HTMLElement, label: string): HTMLButtonElement {
  const button = el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (button === null) throw new Error(`Missing ${label}`);
  return button;
}
function input(el: HTMLElement, id: string): HTMLInputElement {
  const field = el.querySelector<HTMLInputElement>(`[data-button-id="${id}"] input`);
  if (field === null) throw new Error(`Missing ${id}`);
  return field;
}
function ids(el: HTMLElement): (string | null)[] {
  return [...el.querySelectorAll('.sl-manage-row:not([data-dnd-placeholder])')].map((row) =>
    row.getAttribute('data-button-id'),
  );
}

describe('editing button identities', () => {
  it('keeps rename focus and the existing row while saving', async () => {
    const { el, actions } = draw();
    const field = input(el, 'a');
    field.focus();
    field.value = '  Renamed  ';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => expect(actions.rename).toHaveBeenCalledWith('a', 'Renamed'));
    await vi.waitFor(() => expect(field.value).toBe('Renamed'));
    expect(input(el, 'a')).toBe(field);
    expect(document.activeElement).toBe(field);
  });
  it('saves on blur and lets Escape discard a pending rename', async () => {
    const { el, actions } = draw();
    const field = input(el, 'a');
    field.value = 'Draft';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await vi.waitFor(() => expect(field.value).toBe('A'));
    expect(actions.rename).not.toHaveBeenCalled();
    field.value = 'Saved';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await vi.waitFor(() => expect(actions.rename).toHaveBeenCalledWith('a', 'Saved'));
  });
  it('does not save an unchanged trimmed name', async () => {
    const { el, actions } = draw();
    const field = input(el, 'a');
    field.value = ' A ';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => expect(field.value).toBe('A'));
    expect(actions.rename).not.toHaveBeenCalled();
  });
  it('restores blank names without saving', async () => {
    const { el, actions } = draw();
    const field = input(el, 'a');
    field.value = '  ';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => expect(field.value).toBe('A'));
    expect(actions.rename).not.toHaveBeenCalled();
  });
  it('moves by the current identity after the open list became stale', async () => {
    const { el, actions, replace } = draw();
    replace(['c', 'a', 'b']);
    control(el, 'Move A down').click();
    await vi.waitFor(() => expect(actions.move).toHaveBeenCalledWith(1, 2));
    await vi.waitFor(() => expect(ids(el)).toEqual(['c', 'b', 'a']));
  });
  it('does not move another row if the original row was removed', async () => {
    const { el, actions, replace } = draw();
    replace(['b', 'c']);
    control(el, 'Move A down').click();
    await settle();
    expect(actions.move).not.toHaveBeenCalled();
  });
  it('blocks a second mutation while the first save is pending', async () => {
    const { el, actions } = draw();
    let complete: (() => void) | undefined;
    vi.mocked(actions.move).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    control(el, 'Move A down').click();
    control(el, 'Delete B').click();
    await vi.waitFor(() => expect(el.querySelector('[aria-busy="true"]')).not.toBeNull());
    expect(actions.remove).not.toHaveBeenCalled();
    expect(control(el, 'Delete B').disabled).toBe(true);
    complete?.();
    await vi.waitFor(() => expect(control(el, 'Delete B').disabled).toBe(false));
  });
  it('shows a failed save and allows retry without an unhandled rejection', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { el, actions } = draw();
    vi.mocked(actions.remove).mockRejectedValueOnce(new Error('disk full'));
    control(el, 'Delete B').click();
    await vi.waitFor(() =>
      expect(el.querySelector('[role="alert"]')?.textContent).toContain('Try again'),
    );
    expect(ids(el)).toEqual(['a', 'b', 'c']);
    control(el, 'Delete B').click();
    await vi.waitFor(() => expect(ids(el)).toEqual(['a', 'c']));
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
  it('refreshes additions and stays unmounted when an add dialog completes after closing', async () => {
    const { el, actions, replace } = draw([]);
    expect(el.textContent).toContain('No buttons yet');
    const button = [...el.querySelectorAll('button')].find(
      (item) => item.textContent === 'Save current layout',
    );
    button?.click();
    const callback = vi.mocked(actions.addLayout).mock.calls[0]?.[0];
    expect(callback).toBeTypeOf('function');
    replace(['a']);
    callback?.();
    await vi.waitFor(() => expect(ids(el)).toEqual(['a']));
    render(null, el);
    replace(['a', 'b']);
    callback?.();
    await settle();
    expect(el.childElementCount).toBe(0);
  });
  it('offers both native add callbacks and appropriate boundary movement controls', () => {
    const { el, actions } = draw();
    expect(control(el, 'Move A up').disabled).toBe(true);
    expect(control(el, 'Move C down').disabled).toBe(true);
    [...el.querySelectorAll('button')].find((item) => item.textContent === 'Add command')?.click();
    expect(actions.addCommand).toHaveBeenCalledOnce();
  });
});

const at = (type: string, y: number): PointerEvent =>
  new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 20,
    clientY: y,
    button: 0,
    isPrimary: true,
    pointerType: 'mouse',
  });
describe('real dnd-kit lifecycle', () => {
  it('persists the source and target from the real drag manager on pointer release', async () => {
    // Supply the row geometry jsdom cannot lay out. The real pointer sensor,
    // collision observer and provider select and persist the target themselves.
    const managerGetter = vi.spyOn(Sortable.prototype, 'manager', 'get');
    const { el, actions } = draw(['a', 'b']);
    const rows = [...el.querySelectorAll<HTMLElement>('.sl-manage-row')];
    const originalRectangle = Reflect.get(HTMLElement.prototype, 'getBoundingClientRect');
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const id = this.closest<HTMLElement>('[data-button-id]')?.dataset.buttonId;
      if (id === 'a' || id === 'b') {
        // Browser rectangles include the feedback transform, including on clones.
        // A static rectangle prevents dnd-kit's reactive collision update.
        const translate = this.style.getPropertyValue('--dnd-translate').split(' ');
        const x = Number.parseFloat(translate[0] ?? '') || 0;
        const y = Number.parseFloat(translate[1] ?? '') || 0;
        return new DOMRect(x, (id === 'a' ? 0 : 60) + y, 200, 40);
      }
      // Keep the editor's ancestors visible to the native position observer.
      return this.contains(el) || el.contains(this)
        ? new DOMRect(0, 0, 800, 600)
        : originalRectangle.call(this);
    });
    vi.spyOn(document, 'elementFromPoint').mockImplementation(
      (_x, y) => rows[Math.floor(y / 60)] ?? null,
    );
    await settle();
    control(el, 'Move A').dispatchEvent(at('pointerdown', 10));
    await vi.waitFor(() =>
      expect(el.querySelector('.sl-manage-dragging:not([data-dnd-placeholder])')).not.toBeNull(),
    );
    const manager: unknown = managerGetter.mock.results.find(
      (result) => result.type === 'return' && result.value !== undefined,
    )?.value;
    if (!(manager instanceof DragDropManager)) throw new Error('Missing drag manager');
    await vi.waitFor(() => expect(manager.dragOperation.status.dragging).toBe(true));
    document.dispatchEvent(at('pointermove', 85));
    await vi.waitFor(() =>
      expect(el.querySelector('[data-button-id="b"].sl-manage-target')).not.toBeNull(),
    );
    document.dispatchEvent(at('pointerup', 85));
    await vi.waitFor(() => expect(actions.move).toHaveBeenCalledWith(0, 1));
    await vi.waitFor(() => expect(ids(el)).toEqual(['b', 'a']));
  });
  it('releases a pointer in a separate owning document', async () => {
    const owner = document.implementation.createHTMLDocument('Settings');
    const { el, actions } = draw(['a', 'b'], owner);
    await settle();
    control(el, 'Move A').dispatchEvent(at('pointerdown', 0));
    await settle();
    owner.dispatchEvent(at('pointermove', 40));
    await vi.waitFor(() =>
      expect(el.querySelector('.sl-manage-dragging:not([data-dnd-placeholder])')).not.toBeNull(),
    );
    owner.dispatchEvent(at('pointerup', 40));
    await vi.waitFor(() =>
      expect(el.querySelector('.sl-manage-dragging:not([data-dnd-placeholder])')).toBeNull(),
    );
    expect(actions.move).not.toHaveBeenCalled();
  });
  it('removes active drag listeners when the editor is unmounted', async () => {
    const owner = document.implementation.createHTMLDocument('Settings');
    const { el, actions } = draw(['a', 'b'], owner);
    await settle();
    control(el, 'Move A').dispatchEvent(at('pointerdown', 0));
    await vi.waitFor(() =>
      expect(el.querySelector('.sl-manage-dragging:not([data-dnd-placeholder])')).not.toBeNull(),
    );
    render(null, el);
    owner.dispatchEvent(at('pointermove', 80));
    owner.dispatchEvent(at('pointerup', 80));
    await settle();
    expect(el.childElementCount).toBe(0);
    expect(actions.move).not.toHaveBeenCalled();
  });
  it('cancels keyboard dragging without changing order in a separate document', async () => {
    const owner = document.implementation.createHTMLDocument('Settings');
    const { el, actions } = draw(['a', 'b'], owner);
    await settle();
    control(el, 'Move A').dispatchEvent(
      new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        bubbles: true,
        cancelable: true,
      }),
    );
    await vi.waitFor(() =>
      expect(el.querySelector('.sl-manage-dragging:not([data-dnd-placeholder])')).not.toBeNull(),
    );
    owner.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
    await vi.waitFor(() =>
      expect(el.querySelector('.sl-manage-dragging:not([data-dnd-placeholder])')).toBeNull(),
    );
    expect(actions.move).not.toHaveBeenCalled();
    expect(ids(el)).toEqual(['a', 'b']);
  });
});

describe('native modal lifecycle', () => {
  it('unmounts before closing and can be opened again', () => {
    const { actions } = draw();
    const modal = new ManageButtonsModal({} as App, actions);
    modal.onOpen();
    expect(modal.contentEl.querySelectorAll('.sl-manage-row')).toHaveLength(3);
    modal.onClose();
    modal.onClose();
    expect(modal.contentEl.childElementCount).toBe(0);
    modal.onOpen();
    expect(modal.contentEl.querySelectorAll('.sl-manage-row')).toHaveLength(3);
    modal.onClose();
  });
  it('cleans up when the owning window unloads', () => {
    const { actions } = draw();
    const modal = new ManageButtonsModal({} as App, actions);
    modal.onOpen();
    window.dispatchEvent(new Event('unload'));
    expect(modal.contentEl.childElementCount).toBe(0);
  });
  it('renders a plain fallback if initial rendering fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const el = document.body.createDiv();
    el.remove();
    const Broken = (): never => {
      throw new Error('render failed');
    };
    const destroy = mountIsland(el, <Broken />);
    expect(el.textContent).toContain('Could not open');
    destroy();
    destroy();
    expect(el.childElementCount).toBe(0);
  });
});

describe('Russian management editor', () => {
  it('localizes row actions and errors without translating saved names', async () => {
    vi.spyOn(obsidian, 'getLanguage').mockReturnValue('ru');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { el, actions } = draw();
    expect(el.textContent).toContain(
      'Настройте кнопки правой боковой панели. Изменения сохраняются автоматически.',
    );
    expect(el.querySelector('ul')?.getAttribute('aria-label')).toBe('Кнопки правой боковой панели');
    expect(input(el, 'a').getAttribute('aria-label')).toBe('Название кнопки A');
    expect(input(el, 'a').value).toBe('A');
    expect(control(el, 'Переместить A').disabled).toBe(false);
    expect(control(el, 'Переместить A вверх').disabled).toBe(true);
    expect(control(el, 'Переместить A вниз').disabled).toBe(false);
    vi.mocked(actions.remove).mockRejectedValueOnce(new Error('disk full'));
    control(el, 'Удалить A').click();
    await vi.waitFor(() =>
      expect(el.querySelector('[role="alert"]')?.textContent).toBe(
        'Не удалось обновить кнопки. Попробуйте ещё раз.',
      ),
    );
    expect(el.querySelector('.sl-manage-meta')?.textContent).toBe('Команда');
  });
  it.each(['left', 'right'] as const)(
    'localizes the %s modal title and empty state',
    async (side) => {
      vi.spyOn(obsidian, 'getLanguage').mockReturnValue('ru');
      const { actions } = draw([]);
      const modal = new ManageButtonsModal({} as App, { ...actions, side });
      modal.open();
      const inflection = side === 'left' ? 'левой' : 'правой';
      expect(modal.titleEl.textContent).toBe(`Кнопки ${inflection} боковой панели`);
      expect(modal.contentEl.textContent).toContain(
        `Кнопок пока нет. Сохраните текущую раскладку ${inflection} боковой панели или добавьте кнопку команды.`,
      );
      expect(
        [...modal.contentEl.querySelectorAll('button')].map((button) => button.textContent),
      ).toEqual(['Сохранить текущую раскладку', 'Добавить команду']);
      await vi.waitFor(() => expect(modal.contentEl.textContent).toContain('Нет видимых кнопок'));
      modal.close();
    },
  );
});
