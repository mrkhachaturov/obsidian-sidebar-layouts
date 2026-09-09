/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import { Notice } from 'obsidian';

/** A single boundary for messages displayed by the plugin. */
export function notify(message: string, variant?: 'success' | 'warning'): void {
  const notice = new Notice(`Sidebar Layouts: ${message}`);
  if (variant !== undefined)
    notice.containerEl.addClass(variant === 'success' ? 'mod-success' : 'mod-warning');
}

/** Failed asynchronous work remains observable without an unhandled rejection.
 * Callers translate the plugin-owned context; host error details stay verbatim. */
export function reportError(error: unknown, context: string): void {
  console.error(`Sidebar Layouts: ${context}`, error);
  const detail = error instanceof Error ? error.message : String(error);
  new Notice(`Sidebar Layouts: ${context}\n${detail}`, 15000);
}
