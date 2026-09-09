/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import { type ComponentChild, render } from 'preact';
import { reportError } from '../logging';

/** Unmount before the native host removes its DOM, including popout-window teardown. */
export function mountIsland(target: HTMLElement, node: ComponentChild): () => void {
  let mounted = true;
  try {
    render(node, target);
  } catch (error) {
    reportError(error, 'Could not open the button editor.');
    render(null, target);
    target.textContent = 'Could not open the button editor. Close it and try again.';
  }
  return () => {
    if (!mounted) return;
    mounted = false;
    render(null, target);
    target.textContent = '';
  };
}
