/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import {
  type App,
  type WorkspaceItem,
  type WorkspaceLeaf,
  type WorkspaceParent,
  WorkspaceSidedock,
} from 'obsidian';
import { t } from '../i18n';
import type { Arrangement, SidebarSide } from '../model';

export type MutableParent = WorkspaceParent & {
  children: WorkspaceItem[];
  insertChild: (index: number, child: WorkspaceItem) => void;
  removeChild: (child: WorkspaceItem) => void;
};

export function mutableParent(parent: WorkspaceParent | null | undefined): MutableParent | null {
  return parent !== null &&
    parent !== undefined &&
    Array.isArray(parent.children) &&
    typeof parent.insertChild === 'function' &&
    typeof parent.removeChild === 'function'
    ? (parent as MutableParent)
    : null;
}

export function sidebarSplit(app: App, side: SidebarSide = 'right'): MutableParent | null {
  const split = side === 'left' ? app.workspace.leftSplit : app.workspace.rightSplit;
  return split instanceof WorkspaceSidedock ? mutableParent(split) : null;
}

/**
 * Obsidian 1.13.7 uses removeChild + insertChild to move a leaf. Calling the
 * leaf's detach instead closes its view and resets it to EmptyView. Keep this
 * private API boundary guarded, and recover the source if insertion fails.
 */
export function moveLeaf(leaf: WorkspaceLeaf, target: MutableParent): void {
  const source = mutableParent(leaf.parent);
  if (source === null) throw new Error(t('The source tab group cannot move leaves'));
  if (source === target) return;
  const index = source.children.indexOf(leaf);
  const grandparent = mutableParent(source.parent);
  const groupIndex = grandparent?.children.indexOf(source) ?? -1;
  if (index < 0 || grandparent === null || groupIndex < 0)
    throw new Error(t('The source tab group is no longer attached'));
  try {
    source.removeChild(leaf);
    target.insertChild(-1, leaf);
  } catch (error) {
    // removeChild can remove an emptied group from its split. Reattach that
    // group before restoring the leaf; neither operation closes a view.
    if (!grandparent.children.includes(source)) grandparent.insertChild(groupIndex, source);
    const current = mutableParent(leaf.parent);
    if (current !== null && current !== source && current.children.includes(leaf))
      current.removeChild(leaf);
    if (!source.children.includes(leaf)) source.insertChild(index, leaf);
    throw error;
  }
}

export function canCreateView(app: App, type: string): boolean {
  const registry = app.viewRegistry;
  return (
    typeof registry?.getViewCreatorByType === 'function' &&
    typeof registry.getViewCreatorByType(type) === 'function'
  );
}

function layoutHeights(shape: Arrangement): number[] | null | false {
  const floors = shape.floors.map((floor) => floor.dimension);
  if (
    [shape.homeDimension, ...floors].some(
      (height) =>
        height !== undefined && (!Number.isFinite(height) || height <= 0 || height >= 100),
    )
  )
    return false;
  if (floors.length === 0 || floors.some((height) => height === undefined)) return null;
  const belowTotal = floors.reduce<number>((sum, height) => sum + (height ?? 0), 0);
  const top = shape.homeDimension ?? 100 - belowTotal;
  if (belowTotal <= 0 || belowTotal >= 100 || Math.abs(top + belowTotal - 100) > 0.1) return false;
  return [top, ...floors.map((height) => height ?? 0)];
}

/** Validate geometry and the host capability before changing the tree. */
export function canApplyHeights(
  app: App,
  shape: Arrangement,
  side: SidebarSide = 'right',
): boolean {
  const wanted = layoutHeights(shape);
  const split = sidebarSplit(app, side);
  return (
    wanted !== false &&
    split !== null &&
    (wanted === null || typeof split.recomputeChildrenDimensions === 'function')
  );
}

/** No public API sets group heights; unknown host implementations are refused. */
export function applyHeights(app: App, shape: Arrangement, side: SidebarSide = 'right'): boolean {
  const split = sidebarSplit(app, side);
  const wanted = layoutHeights(shape);
  if (split === null || wanted === false) return false;
  if (wanted === null) return true;
  if (typeof split.recomputeChildrenDimensions !== 'function') return false;
  if (wanted.length !== split.children.length) return false;
  const previous = split.children.map((child) => child.dimension);
  try {
    split.children.forEach((child, index) => {
      const height = wanted[index];
      if (height !== undefined) child.dimension = height;
    });
    split.recomputeChildrenDimensions();
    return true;
  } catch (error) {
    split.children.forEach((child, index) => {
      const height = previous[index];
      if (height === undefined) delete child.dimension;
      else child.dimension = height;
    });
    console.error('Sidebar Layouts: could not restore sidebar heights', error);
    return false;
  }
}
