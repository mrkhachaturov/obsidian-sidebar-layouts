import type { App, Command, Modal } from 'obsidian';
import * as obsidian from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayoutButton } from '../../src/model';
import { CommandSuggest, IconSuggest, LayoutSuggest, SaveLayoutModal } from '../../src/ui/modals';
import { required } from './required';

const app = {
  commands: { commands: {} },
  workspace: { getLeavesOfType: () => [] },
} as unknown as App;
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
describe('save layout modal', () => {
  const shape = {
    home: 'file-explorer',
    homeDimension: 60,
    floors: [{ view: 'bookmarks', dimension: 40 }],
  };
  function button(modal: Modal, text: string): HTMLButtonElement {
    return required(
      [...modal.contentEl.querySelectorAll('button')].find((item) => item.textContent === text),
    );
  }
  it('shows the selected side and captured arrangement in order, including dimensions', () => {
    const modal = new SaveLayoutModal(app, 'left', shape, vi.fn());
    modal.open();
    expect(modal.modalEl.textContent).toContain('Save left sidebar layout');
    expect([...modal.contentEl.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
      'File explorer (60%)',
      'Bookmarks (40%)',
    ]);
    modal.close();
  });
  it('validates a blank name and submits one trimmed name, ignoring IME and stale events', () => {
    const submitted = vi.fn();
    const modal = new SaveLayoutModal(app, 'right', shape, submitted);
    modal.open();
    const input = required(modal.contentEl.querySelector('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(submitted).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(modal.contentEl.querySelector('[role="alert"]')?.textContent).toBe(
      'Enter a layout name.',
    );
    input.value = '  Research  ';
    input.dispatchEvent(new Event('input'));
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
    expect(submitted).not.toHaveBeenCalled();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(submitted).toHaveBeenCalledExactlyOnceWith('Research', 'layout-dashboard');
    expect(modal.contentEl.children).toHaveLength(0);
  });
  it('integrates icon selection before saving and ignores an old picker after close and reopen', () => {
    const opening = vi.spyOn(IconSuggest.prototype, 'open');
    const submitted = vi.fn();
    const modal = new SaveLayoutModal(app, 'left', shape, submitted);
    modal.open();
    button(modal, 'Change icon').click();
    const picker = required(opening.mock.contexts[0]);
    if (!(picker instanceof IconSuggest)) throw new Error('Missing icon picker');
    picker.onChooseItem('star');
    expect(modal.contentEl.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('star');
    picker.close();
    modal.close();
    modal.open();
    picker.onChooseItem('moon');
    expect(modal.contentEl.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('star');
    const input = required(modal.contentEl.querySelector('input'));
    input.value = 'Navigation';
    input.dispatchEvent(new Event('input'));
    button(modal, 'Save layout').click();
    expect(submitted).toHaveBeenCalledExactlyOnceWith('Navigation', 'star');
    opening.mockRestore();
  });
  it('cancels without saving and ignores controls from a previous opening', () => {
    const submitted = vi.fn();
    const modal = new SaveLayoutModal(app, 'right', { home: null, floors: [] }, submitted);
    modal.open();
    expect(modal.contentEl.textContent).toContain('No panels in this sidebar.');
    const cancelledInput = required(modal.contentEl.querySelector('input'));
    const cancelledSave = button(modal, 'Save layout');
    button(modal, 'Cancel').click();
    modal.open();
    cancelledInput.value = 'Old name';
    cancelledInput.dispatchEvent(new Event('input'));
    cancelledInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    cancelledSave.click();
    expect(submitted).not.toHaveBeenCalled();
    expect(modal.contentEl.querySelectorAll('input')).toHaveLength(1);
    expect(required(modal.contentEl.querySelector('input')).value).toBe('');
    modal.close();
  });
});
describe('pickers', () => {
  it('returns layout copies and invokes selection only when an item is chosen', () => {
    const layout = { id: 'a', name: 'Research' } as LayoutButton;
    const selected = vi.fn();
    const source = [layout];
    const picker = new LayoutSuggest(app, source, 'Choose', selected);
    picker.getItems().pop();
    expect(source).toHaveLength(1);
    expect(picker.getItemText(layout)).toBe('Research');
    picker.open();
    picker.close();
    expect(selected).not.toHaveBeenCalled();
    picker.onChooseItem(layout);
    expect(selected).toHaveBeenCalledExactlyOnceWith(layout);
  });
  it('renders command names as text, handles commands without icons and reads the latest registry', () => {
    const commands: Record<string, Command> = {
      x: { id: 'x', name: '<img src=x onerror=alert(1)>', icon: 'star' },
    };
    const currentApp = { commands: { commands } } as unknown as App;
    const selected = vi.fn();
    const picker = new CommandSuggest(currentApp, selected);
    const element = document.body.createDiv();
    picker.renderSuggestion({ item: required(commands.x) }, element);
    expect(element.querySelector('img')).toBeNull();
    expect(element.textContent).toBe(required(commands.x).name);
    commands.y = { id: 'y', name: 'New command' };
    picker.renderSuggestion({ item: commands.y }, element);
    expect(picker.getItems()).toHaveLength(2);
    expect(picker.getItemText(commands.y)).toBe('New command');
    picker.onChooseItem(commands.y);
    expect(selected).toHaveBeenCalledWith(commands.y);
  });
  it('lists icons and renders readable labels with safe text', () => {
    const selected = vi.fn();
    const picker = new IconSuggest(app, selected);
    expect(picker.getItems().length).toBeGreaterThan(0);
    const element = document.body.createDiv();
    picker.renderSuggestion({ item: 'lucide-star' }, element);
    expect(element.textContent).toBe('star');
    expect(element.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('lucide-star');
    picker.onChooseItem('lucide-star');
    expect(selected).toHaveBeenCalledWith('lucide-star');
  });
});

describe('Russian modal rendering', () => {
  it.each(['left', 'right'] as const)(
    'localizes the %s save form while preserving the submitted name',
    (side) => {
      vi.spyOn(obsidian, 'getLanguage').mockReturnValue('ru');
      const submitted = vi.fn();
      const modal = new SaveLayoutModal(
        app,
        side,
        { home: 'file-explorer', floors: [] },
        submitted,
      );
      modal.open();
      expect(modal.modalEl.textContent).toContain(
        `Сохранить раскладку ${side === 'left' ? 'левой' : 'правой'} боковой панели`,
      );
      expect(modal.contentEl.querySelector('li')?.textContent).toBe('Файлы');
      const field = required(modal.contentEl.querySelector('input'));
      expect(field.getAttribute('aria-label')).toBe('Название раскладки');
      expect(
        [...modal.contentEl.querySelectorAll('button')].map((button) => button.textContent),
      ).toEqual(['Изменить значок', 'Отмена', 'Сохранить раскладку']);
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(modal.contentEl.querySelector('[role="alert"]')?.textContent).toBe(
        'Введите название раскладки.',
      );
      field.value = 'My Research';
      field.dispatchEvent(new Event('input'));
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(submitted).toHaveBeenCalledExactlyOnceWith('My Research', 'layout-dashboard');
    },
  );
  it('localizes picker placeholders and preserves external command names', () => {
    vi.spyOn(obsidian, 'getLanguage').mockReturnValue('ru');
    const placeholder = vi.spyOn(obsidian.FuzzySuggestModal.prototype, 'setPlaceholder');
    new IconSuggest(app, vi.fn());
    const command = new CommandSuggest(app, vi.fn());
    expect(placeholder.mock.calls).toEqual([['Поиск значков'], ['Выберите команду']]);
    expect(command.getItemText({ id: 'other:command', name: 'Other plugin command' })).toBe(
      'Other plugin command',
    );
  });
});
