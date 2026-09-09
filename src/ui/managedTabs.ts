/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import type { SidebarSide } from '../model';

const headerSelector = (side: SidebarSide): string =>
  `.workspace-split.mod-${side}-split .workspace-tab-header`;
const HIDDEN_CLASS = 'sl-managed-tab-hidden';
interface ManagedTabs {
  hidden: ReadonlySet<string>;
  observer: MutationObserver | null;
}
const documents = new WeakMap<Document, Map<SidebarSide, ManagedTabs>>();

function update(doc: Document, hidden: ReadonlySet<string>, side: SidebarSide): void {
  for (const header of doc.querySelectorAll<HTMLElement>(headerSelector(side))) {
    const type = header.getAttribute('data-type');
    header.classList.toggle(HIDDEN_CLASS, type !== null && hidden.has(type));
  }
}

/** Hide only managed panel headers; view type strings are data, never CSS. */
export function applyManagedTabStyle(
  doc: Document,
  hide: ReadonlySet<string>,
  enabled: boolean,
  side: SidebarSide = 'right',
): void {
  if (!enabled || hide.size === 0) {
    removeManagedTabStyle(doc, side);
    return;
  }
  let sides = documents.get(doc);
  if (sides === undefined) {
    sides = new Map();
    documents.set(doc, sides);
  }
  let state = sides.get(side);
  if (state === undefined) {
    state = { hidden: new Set(hide), observer: null };
    const current = state;
    const owner = doc.defaultView;
    if (owner !== null) {
      current.observer = new owner.MutationObserver(() => update(doc, current.hidden, side));
      current.observer.observe(doc.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-type'],
      });
    }
    sides.set(side, state);
  } else {
    state.hidden = new Set(hide);
  }
  update(doc, state.hidden, side);
}

export function removeManagedTabStyle(doc: Document, side?: SidebarSide): void {
  const sides = documents.get(doc);
  const selected: SidebarSide[] = side === undefined ? ['left', 'right'] : [side];
  for (const current of selected) {
    sides?.get(current)?.observer?.disconnect();
    sides?.delete(current);
    for (const header of doc.querySelectorAll(headerSelector(current)))
      header.classList.remove(HIDDEN_CLASS);
  }
  if (sides?.size === 0) documents.delete(doc);
}
