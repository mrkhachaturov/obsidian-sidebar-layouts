/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

export type SidebarSide = 'left' | 'right';
export type ButtonPlacement = 'header' | 'panel';

export interface Floor {
  readonly view: string;
  readonly dimension?: number;
}

/** A shape of a sidebar: what is on top, and what is stacked below. */
export interface Arrangement {
  readonly home: string | null;
  /** Height of the top group, as a percentage of the sidebar. */
  readonly homeDimension?: number;
  readonly floors: readonly Floor[];
}

interface Common {
  readonly id: string;
  readonly side: SidebarSide;
  readonly placement: ButtonPlacement;
  /** Keep this header button visible while its sidebar is closed. */
  readonly showWhenCollapsed: boolean;
  readonly name: string;
  readonly icon: string;
  readonly visible: boolean;
}

export interface LayoutButton extends Common {
  readonly kind: 'layout';
  /** What the user recorded on purpose. */
  readonly saved: Arrangement;
  /* Absent means untouched. Notebook Navigator's appearance overrides work the
   * same way: "use the default" is stored as no value at all, and resetting
   * removes it rather than writing a copy back. */
  readonly working?: Arrangement;
  readonly fullWidthNotes: boolean;
  readonly registerCommand: boolean;
}

export interface CommandButton extends Common {
  readonly kind: 'command';
  readonly commandId: string;
}

export type Button = LayoutButton | CommandButton;

export interface PluginData {
  buttons: Button[];
  /** The layout in force in each sidebar. Not the same as what is on screen: opening a note
   *  leaves the layout governing while the sidebar shows something else. */
  governing: Record<SidebarSide, string | null>;
  hideManagedTabs: boolean;
  showTooltips: boolean;
}

export const DEFAULT_DATA: PluginData = {
  buttons: [],
  governing: { left: null, right: null },
  hideManagedTabs: true,
  showTooltips: true,
};

export function isLayout(button: Button): button is LayoutButton {
  return button.kind === 'layout';
}

/** What this layout shows: the working shape when it has one. */
export function arrangementOf(layout: LayoutButton): Arrangement {
  return layout.working ?? layout.saved;
}

export function isModified(layout: LayoutButton): boolean {
  return layout.working !== undefined;
}

export function panelsOf(arrangement: Arrangement): string[] {
  const top = arrangement.home === null ? [] : [arrangement.home];
  return [...top, ...arrangement.floors.map((floor) => floor.view)];
}

/** Every panel any layout declares, saved or working. */
export function declaredPanels(buttons: readonly Button[]): Set<string> {
  const panels = new Set<string>();
  for (const button of buttons) {
    if (!isLayout(button)) continue;
    for (const panel of panelsOf(button.saved)) panels.add(panel);
    if (button.working !== undefined) {
      for (const panel of panelsOf(button.working)) panels.add(panel);
    }
  }
  return panels;
}

/* Rounded, because a drag lands on fractions nobody meant. And a height that
 * is absent means "whatever is left", so it cannot disagree with anything -
 * comparing it as a value made a layout differ from itself the moment it was
 * applied, and the difference came straight back after every reset. */
function sameHeight(a: number | undefined, b: number | undefined): boolean {
  return a === undefined || b === undefined || Math.round(a) === Math.round(b);
}

export function sameArrangement(a: Arrangement, b: Arrangement): boolean {
  if (a.home !== b.home || a.floors.length !== b.floors.length) return false;
  if (!sameHeight(a.homeDimension, b.homeDimension)) return false;
  return a.floors.every((floor, index) => {
    const other = b.floors[index];
    return (
      other !== undefined &&
      floor.view === other.view &&
      sameHeight(floor.dimension, other.dimension)
    );
  });
}

export function newId(): string {
  return crypto.randomUUID();
}

export function moveInList<T extends { id: string }>(list: T[], id: string, delta: number): void {
  if (!Number.isInteger(delta)) return;
  const from = list.findIndex((entry) => entry.id === id);
  const to = from + delta;
  const moving = list[from];
  if (from < 0 || to < 0 || to >= list.length || moving === undefined) return;
  list.splice(from, 1);
  list.splice(to, 0, moving);
}
