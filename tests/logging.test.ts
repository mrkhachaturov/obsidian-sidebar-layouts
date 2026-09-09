import * as obsidian from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../src/i18n';
import { notify, reportError } from '../src/logging';

const notices = vi.hoisted(() => ({
  messages: [] as { text: string; duration: number | undefined; classes: string[] }[],
}));
vi.mock('obsidian', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Notice: class {
    readonly containerEl: { addClass: (name: string) => void };
    constructor(text: string, duration?: number) {
      const record = { text, duration, classes: [] as string[] };
      notices.messages.push(record);
      this.containerEl = {
        addClass: (name) => {
          record.classes.push(name);
        },
      };
    }
  },
}));
afterEach(() => {
  notices.messages.length = 0;
  vi.restoreAllMocks();
});

describe('user-visible reporting', () => {
  it('includes the failed operation and underlying error, with time to read it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('Disk is full');
    reportError(error, 'Saving layouts');
    expect(consoleError).toHaveBeenCalledWith('Sidebar Layouts: Saving layouts', error);
    expect(notices.messages).toEqual([
      { text: 'Sidebar Layouts: Saving layouts\nDisk is full', duration: 15000, classes: [] },
    ]);
  });
  it('also reports non-Error rejections and keeps notification severity separate', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    reportError('Permission denied', 'Saving layouts');
    expect(notices.messages[0]?.text).toContain('Permission denied');
    notify('Created', 'success');
    notify('Unavailable', 'warning');
    notify('Ready');
    expect(notices.messages.slice(1).map((notice) => notice.classes)).toEqual([
      ['mod-success'],
      ['mod-warning'],
      [],
    ]);
  });
});

it('displays Russian operation context with the original host error', () => {
  vi.spyOn(obsidian, 'getLanguage').mockReturnValue('ru');
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const error = new Error('Disk is full');
  reportError(error, t('Saving layouts'));
  expect(consoleError).toHaveBeenCalledWith('Sidebar Layouts: Сохранение раскладок', error);
  expect(notices.messages).toEqual([
    { text: 'Sidebar Layouts: Сохранение раскладок\nDisk is full', duration: 15000, classes: [] },
  ]);
});
