/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import { getLanguage } from 'obsidian';
import { runtimeMessages } from './i18n-runtime';
import { uiMessages } from './i18n-ui';

const messages = { ...uiMessages, ...runtimeMessages };
export type MessageKey = keyof typeof messages;
const russianPlurals = new Intl.PluralRules('ru');

/** Read Obsidian's language at use time so reopened UI follows the current locale. */
export function t(message: MessageKey, values: Record<string, string | number> = {}): string {
  const language = getLanguage().trim().toLowerCase().split(/[-_]/)[0];
  const translated = language === 'ru' ? messages[message] : undefined;
  let template: string = message;
  if (typeof translated === 'string') template = translated;
  else if (translated !== undefined) {
    const count = values.count;
    const category = russianPlurals.select(typeof count === 'number' ? count : 0);
    template =
      category === 'one' || category === 'few' || category === 'many'
        ? translated[category]
        : translated.other;
  }
  return template.replace(/\{(\w+)\}/g, (placeholder: string, name: string) =>
    // biome-ignore lint/suspicious/noPrototypeBuiltins: The plugin targets ES2020.
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : placeholder,
  );
}
