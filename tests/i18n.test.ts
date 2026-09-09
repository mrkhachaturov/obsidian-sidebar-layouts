import * as obsidian from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type MessageKey, t } from '../src/i18n';
import { runtimeMessages } from '../src/i18n-runtime';
import { uiMessages } from '../src/i18n-ui';
import type { Button } from '../src/model';
import { summarizeButtons } from '../src/ui/labels';

afterEach(() => vi.restoreAllMocks());

describe('Obsidian language localization', () => {
  it.each(['ru', 'ru-RU', 'RU_ru', ' ru '])('normalizes Russian locale %s', (locale) => {
    vi.spyOn(obsidian, 'getLanguage').mockReturnValue(locale);
    expect(t('Save current layout')).toBe('Сохранить текущую раскладку');
  });

  it.each(['en', 'en-US', 'fr', '', 'russian'])('uses English fallback for %s', (locale) => {
    vi.spyOn(obsidian, 'getLanguage').mockReturnValue(locale);
    expect(t('Move {name}', { name: 'My layout' })).toBe('Move My layout');
  });

  it('reads language again and interpolates literal values without replacing their contents', () => {
    const language = vi.spyOn(obsidian, 'getLanguage').mockReturnValue('en');
    expect(t('Move {name}', { name: '{name} $& <img>' })).toBe('Move {name} $& <img>');
    language.mockReturnValue('ru');
    expect(t('Move {name}', { name: '{name} $& <img>' })).toBe('Переместить {name} $& <img>');
    expect(t('Move {name}')).toBe('Переместить {name}');
    expect(t('Missing {count}' as MessageKey, { count: 2 })).toBe('Missing 2');
  });

  it('has nonempty Russian translations and exactly matching placeholders for every English key', () => {
    const placeholders = (text: string): string[] =>
      [...text.matchAll(/\{\w+\}/g)].map((match) => match[0]).sort();
    const catalogs: readonly Readonly<Record<string, string | Readonly<Record<string, string>>>>[] =
      [uiMessages, runtimeMessages];
    for (const catalog of catalogs) {
      for (const [key, translation] of Object.entries(catalog)) {
        const variants =
          typeof translation === 'string' ? [translation] : Object.values(translation);
        for (const variant of variants) {
          if (typeof variant !== 'string') throw new Error(`Invalid translation: ${key}`);
          expect(variant.trim(), key).not.toBe('');
          expect(placeholders(variant), key).toEqual(placeholders(key));
        }
      }
    }
    for (const key of Object.keys(uiMessages)) {
      if (key in runtimeMessages) {
        expect(runtimeMessages[key as keyof typeof runtimeMessages]).toEqual(
          uiMessages[key as keyof typeof uiMessages],
        );
      }
    }
  });

  it.each([
    [0, '0 раскладок · 0 команд'],
    [1, '1 раскладка · 1 команда'],
    [2, '2 раскладки · 2 команды'],
    [5, '5 раскладок · 5 команд'],
    [11, '11 раскладок · 11 команд'],
    [21, '21 раскладка · 21 команда'],
    [22, '22 раскладки · 22 команды'],
  ])('inflects layout and command counts at %i', (count, expected) => {
    vi.spyOn(obsidian, 'getLanguage').mockReturnValue('ru');
    const buttons = Array.from({ length: count }, () => [
      { kind: 'layout' },
      { kind: 'command' },
    ]).flat() as Button[];
    expect(summarizeButtons(buttons)).toBe(expected);
  });

  it('handles fractional and missing counts without losing placeholders', () => {
    vi.spyOn(obsidian, 'getLanguage').mockReturnValue('ru');
    expect(t('{count} layouts', { count: 1.5 })).toBe('1.5 раскладки');
    expect(t('{count} commands')).toBe('{count} команд');
  });
});
