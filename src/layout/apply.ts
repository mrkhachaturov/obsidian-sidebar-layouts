/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import type { App, WorkspaceLeaf } from 'obsidian';
import type { Arrangement, Floor, SidebarSide } from '../model';
import { type DockGroup, readDock } from './dock';
import {
  applyHeights,
  canApplyHeights,
  canCreateView,
  moveLeaf,
  mutableParent,
  sidebarSplit,
} from './host';

type IsCancelled = () => boolean;
const neverCancelled: IsCancelled = () => false;

/** Only leaves created by this operation, still empty, are safe to close. */
function cleanEmpty(
  leaves: readonly WorkspaceLeaf[],
  split: NonNullable<ReturnType<typeof sidebarSplit>>,
): void {
  for (const leaf of leaves) {
    try {
      if (
        leaf.getRoot() === split &&
        leaf.parent !== null &&
        leaf.parent !== undefined &&
        leaf.view.getViewType() === 'empty'
      )
        leaf.detach();
    } catch (error) {
      console.error('Sidebar Layouts: could not remove an empty placeholder', error);
    }
  }
}

function available(
  groups: readonly DockGroup[],
  type: string,
  used: ReadonlySet<WorkspaceLeaf>,
): WorkspaceLeaf | null {
  for (const group of groups) {
    const leaf = group.leaves.find(
      (candidate, index) => group.views[index] === type && !used.has(candidate),
    );
    if (leaf !== undefined) return leaf;
  }
  return null;
}

/**
 * Keep every existing view alive. Unused lower tabs are parked in the top tab
 * group; selected floor leaves move into new groups without resetting state.
 * Missing views are prepared before any existing group is rearranged.
 */
async function arrange(
  app: App,
  homeType: string | null,
  floors: readonly Floor[],
  isCancelled: IsCancelled,
  side: SidebarSide,
): Promise<boolean> {
  const split = sidebarSplit(app, side);
  if (split === null) return false;
  const created: WorkspaceLeaf[] = [];
  try {
    if (isCancelled()) return false;
    let groups = readDock(app, side);
    const originalGroups = groups;
    if (groups.length !== split.children.length) return false;
    if (groups.some((group) => mutableParent(group.parent) === null)) return false;

    const top = groups[0];
    const selected = new Set<WorkspaceLeaf>();
    let home =
      homeType === null || top?.revealed === homeType
        ? (top?.revealedLeaf ?? null)
        : available(groups, homeType, selected);
    if (home !== null) selected.add(home);
    if (home === null && homeType === null) return false;

    const floorLeaves = floors.map((floor, index) => {
      const shown = groups[index + 1];
      const preferred = shown?.revealed === floor.view ? shown.revealedLeaf : null;
      const leaf =
        preferred !== null && !selected.has(preferred)
          ? preferred
          : available(groups, floor.view, selected);
      if (leaf !== null) selected.add(leaf);
      return leaf;
    });

    const missing = floors
      .filter((_floor, index) => floorLeaves[index] === null)
      .map((floor) => floor.view);
    if (home === null && homeType !== null) missing.push(homeType);
    if (missing.some((type) => !canCreateView(app, type))) return false;

    const prepare = async (type: string): Promise<WorkspaceLeaf | null> => {
      if (isCancelled()) return null;
      const leaf =
        side === 'left' ? app.workspace.getLeftLeaf(false) : app.workspace.getRightLeaf(false);
      if (leaf === null) return null;
      created.push(leaf);
      if (mutableParent(leaf.parent) === null || leaf.getRoot() !== split) return null;
      const file = app.workspace.getActiveFile()?.path;
      await leaf.setViewState({ type, active: false, state: file === undefined ? {} : { file } });
      if (
        isCancelled() ||
        sidebarSplit(app, side) !== split ||
        leaf.getRoot() !== split ||
        leaf.view.getViewType() !== type
      )
        return null;
      return leaf;
    };

    if (home === null && homeType !== null) home = await prepare(homeType);
    if (home === null) return false;
    for (const [index, floor] of floors.entries()) {
      if (floorLeaves[index] !== null) continue;
      const leaf = await prepare(floor.view);
      if (leaf === null) return false;
      floorLeaves[index] = leaf;
    }
    if (isCancelled()) return false;

    // Async view initialization may have let the user rebuild the sidebar.
    // Re-read and validate the whole tree before moving any existing leaf.
    if (sidebarSplit(app, side) !== split) return false;
    groups = readDock(app, side);
    if (groups.length !== split.children.length || groups.length === 0) return false;
    if (
      originalGroups.some(
        (group, index) =>
          groups[index]?.parent !== group.parent ||
          group.leaves.some((leaf) => leaf.parent !== group.parent),
      )
    )
      return false;
    const homeParent = mutableParent(groups[0]?.parent);
    if (homeParent === null || groups.some((group) => mutableParent(group.parent) === null))
      return false;
    if (
      home.getRoot() !== split ||
      floorLeaves.some((leaf) => leaf === null || leaf.getRoot() !== split)
    )
      return false;

    const unchanged =
      home.parent === homeParent &&
      groups.length === floors.length + 1 &&
      floorLeaves.every((leaf, index) => groups[index + 1]?.revealedLeaf === leaf);
    if (!unchanged) {
      // Check all destination groups before rearranging the existing ones.
      // A refused allocation can then clean up empty placeholders only.
      const destinations = [];
      for (let index = 0; index < floors.length; index++) {
        if (isCancelled()) return false;
        const placeholder =
          side === 'left' ? app.workspace.getLeftLeaf(true) : app.workspace.getRightLeaf(true);
        if (placeholder === null) return false;
        created.push(placeholder);
        const parent = mutableParent(placeholder.parent);
        if (parent === null || parent === homeParent || placeholder.getRoot() !== split)
          return false;
        destinations.push({ parent, placeholder });
      }
      for (const group of groups.slice(1)) {
        for (const leaf of group.leaves) {
          if (isCancelled()) return false;
          moveLeaf(leaf, homeParent);
        }
      }
      for (const [index, leaf] of floorLeaves.entries()) {
        if (isCancelled() || leaf === null) return false;
        const destination = destinations[index];
        if (destination === undefined) return false;
        moveLeaf(leaf, destination.parent);
        cleanEmpty([destination.placeholder], split);
      }
    }
    if (isCancelled()) return false;
    await app.workspace.revealLeaf(home);
    if (isCancelled()) return false;
    if (sidebarSplit(app, side) !== split) return false;
    const result = readDock(app, side);
    return (
      result.length === floors.length + 1 &&
      result[0]?.revealedLeaf === home &&
      floorLeaves.every((leaf, index) => result[index + 1]?.revealedLeaf === leaf)
    );
  } catch (error) {
    console.error('Sidebar Layouts: could not arrange the sidebar', error);
    return false;
  } finally {
    cleanEmpty(created, split);
  }
}

/** Preserve the shown top tab while restoring or temporarily parking floors. */
export function reconcileFloors(
  app: App,
  floors: readonly Floor[],
  isCancelled: IsCancelled = neverCancelled,
  side: SidebarSide = 'right',
): Promise<boolean> {
  return arrange(app, null, floors, isCancelled, side);
}

export async function restoreArrangementFloors(
  app: App,
  shape: Arrangement,
  isCancelled: IsCancelled = neverCancelled,
  side: SidebarSide = 'right',
): Promise<boolean> {
  return (
    canApplyHeights(app, shape, side) &&
    (await reconcileFloors(app, shape.floors, isCancelled, side)) &&
    !isCancelled() &&
    applyHeights(app, shape, side)
  );
}

export async function applyArrangement(
  app: App,
  shape: Arrangement,
  isCancelled: IsCancelled = neverCancelled,
  side: SidebarSide = 'right',
): Promise<boolean> {
  return (
    canApplyHeights(app, shape, side) &&
    (await arrange(app, shape.home, shape.floors, isCancelled, side)) &&
    !isCancelled() &&
    applyHeights(app, shape, side)
  );
}

/** The view type currently shown in the sidebar's top group. */
export function revealedOnTop(app: App, side: SidebarSide = 'right'): string | null {
  return readDock(app, side)[0]?.revealed ?? null;
}
