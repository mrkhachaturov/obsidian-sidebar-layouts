/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import { type App, setIcon } from 'obsidian';
import { type MessageKey, t } from '../i18n';
import { type Arrangement, type Button, isLayout, isModified, type SidebarSide } from '../model';

/** Turn `outgoing-link` into `Outgoing link` when nothing better is available. */
function prettify(viewType: string): string {
  const words = viewType.replace(/[-_]/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function viewLabel(app: App, viewType: string, side?: SidebarSide): string {
  // A saved arrangement records panel types, not the note open in a Markdown view.
  if (viewType === 'markdown') return t('Note');
  const split = side === 'left' ? app.workspace.leftSplit : app.workspace.rightSplit;
  const leaves = app.workspace.getLeavesOfType(viewType);
  const leaf =
    side === undefined
      ? leaves[0]
      : leaves.find((entry) => split !== undefined && entry.getRoot() === split);
  const text = leaf?.view.getDisplayText().trim();
  if (text !== undefined && text.length > 0) return text;
  const fallback: Partial<Record<string, MessageKey>> = {
    'file-explorer': 'File explorer',
    search: 'Search',
    bookmarks: 'Bookmarks',
    outline: 'Outline',
    backlink: 'Backlink',
    'outgoing-link': 'Outgoing link',
    tag: 'Tag',
    'file-properties': 'File properties',
    file_properties: 'File properties',
    'all-properties': 'All properties',
  };
  const label = fallback[viewType];
  return label === undefined ? prettify(viewType) : t(label);
}

/** Every panel a layout puts in the sidebar, top to bottom. */
export function layoutPanels(
  app: App,
  shape: Arrangement,
  side?: SidebarSide,
): { label: string; height: string }[] {
  const rows: { label: string; height: string }[] = [];
  if (shape.home !== null)
    rows.push({
      label: viewLabel(app, shape.home, side),
      height: shape.homeDimension === undefined ? '' : `${Math.round(shape.homeDimension)}%`,
    });
  for (const floor of shape.floors) {
    rows.push({
      label: viewLabel(app, floor.view, side),
      height: floor.dimension === undefined ? '' : `${Math.round(floor.dimension)}%`,
    });
  }
  return rows;
}

export function describeLayout(app: App, shape: Arrangement, side?: SidebarSide): string {
  const rows = layoutPanels(app, shape, side);
  return rows.length === 0 ? t('Empty') : rows.map((row) => row.label).join(' · ');
}

export function sideLabel(side: SidebarSide): string {
  return side === 'left' ? t('Left sidebar') : t('Right sidebar');
}

export function buttonSummary(button: Button): string {
  return [
    isLayout(button) ? t('Layout') : t('Command'),
    ...(!button.visible ? [t('Hidden')] : []),
    ...(isLayout(button) && isModified(button) ? [t('Modified')] : []),
  ].join(' · ');
}

export function summarizeButtons(buttons: readonly Button[]): string {
  const layouts = buttons.filter(isLayout).length;
  const commands = buttons.length - layouts;
  return `${t(layouts === 1 ? '{count} layout' : '{count} layouts', { count: layouts })} · ${t(commands === 1 ? '{count} command' : '{count} commands', { count: commands })}`;
}

/** A non-interactive representation of the real visible button order. */
export function renderButtonPreview(
  parent: HTMLElement,
  side: SidebarSide,
  buttons: readonly Button[],
): void {
  const preview = parent.createDiv({ cls: 'sl-settings-preview' });
  preview.setAttribute('role', 'list');
  preview.setAttribute(
    'aria-label',
    t(side === 'left' ? 'Left sidebar button preview' : 'Right sidebar button preview'),
  );
  const visible = buttons.filter((button) => button.visible);
  for (const placement of ['header', 'panel'] as const) {
    const group = preview.createDiv({ cls: 'sl-settings-preview-group' });
    group.setAttribute('role', 'group');
    group.dataset.placement = placement;
    const heading = t(placement === 'header' ? 'In the window header' : 'Below panel tabs');
    group.setAttribute('aria-label', heading);
    group.createSpan({ cls: 'sl-settings-preview-label', text: heading });
    const placed = visible.filter((button) => button.placement === placement);
    for (const button of placed) {
      const item = group.createSpan({ cls: 'sl-settings-preview-icon' });
      const label = `${button.name} · ${buttonSummary(button)}`;
      item.setAttribute('role', 'listitem');
      item.setAttribute('aria-label', label);
      item.setAttribute('title', label);
      setIcon(item, button.icon);
    }
    if (placed.length === 0) {
      group.createSpan({ cls: 'sl-settings-preview-empty', text: t('No visible buttons') });
    }
  }
}
