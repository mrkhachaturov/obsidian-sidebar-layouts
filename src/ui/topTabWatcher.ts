/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import type { Plugin } from 'obsidian';
import type { SidebarSide } from '../model';
import { sidebarContainer } from './buttons';

const STRIP_SELECTOR = '.workspace-tab-header-container-inner';

/* The workspace announces sixteen events and none of them is "a group shows a
 * different tab now": `active-leaf-change` is about the active leaf, which a
 * reveal does not change, and `layout-change` is about structure. The DOM does
 * say it - the shown header carries `is-active` - so that is what we watch. */

function shownType(plugin: Plugin, side: SidebarSide): string | null {
  const strip =
    sidebarContainer(plugin.app, side)?.querySelector<HTMLElement>(STRIP_SELECTOR) ?? null;
  return strip?.querySelector('.workspace-tab-header.is-active')?.getAttribute('data-type') ?? null;
}

/** Calls back whenever the tab shown in the sidebar's top group changes. */
export function watchTopTab(
  plugin: Plugin,
  onChange: (viewType: string | null) => void,
  side: SidebarSide = 'right',
): void {
  let active = true;
  let last = shownType(plugin, side);
  let observer: MutationObserver | null = null;

  const check = (): void => {
    if (!active) return;
    const now = shownType(plugin, side);
    if (now === last) return;
    last = now;
    onChange(now);
  };

  const attach = (): void => {
    if (!active) return;
    observer?.disconnect();
    observer = null;
    const strip =
      sidebarContainer(plugin.app, side)?.querySelector<HTMLElement>(STRIP_SELECTOR) ?? null;
    const owner = strip?.ownerDocument.defaultView;
    if (strip !== null && owner !== null && owner !== undefined) {
      observer = new owner.MutationObserver(check);
      observer.observe(strip, {
        attributes: true,
        attributeFilter: ['class', 'data-type'],
        childList: true,
        subtree: true,
      });
    }
    check();
  };

  plugin.register(() => {
    active = false;
    observer?.disconnect();
  });
  plugin.app.workspace.onLayoutReady(() => {
    if (!active) return;
    attach();
    /* The host rebuilds this row on its own schedule, taking the observer with
     * it, so it is re-attached whenever the layout changes. */
    plugin.registerEvent(plugin.app.workspace.on('layout-change', attach));
  });
}
