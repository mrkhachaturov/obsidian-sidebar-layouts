/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import type { App, WorkspaceLeaf, WorkspaceParent } from 'obsidian';
import type { SidebarSide } from '../model';
import { sidebarSplit } from './host';

/** One floor of the selected sidebar. */
export interface DockGroup {
  readonly parent: WorkspaceParent;
  readonly leaves: readonly WorkspaceLeaf[];
  readonly views: readonly string[];
  readonly revealed: string | null;
  readonly revealedLeaf: WorkspaceLeaf | null;
  readonly dimension: number | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Match serialized IDs to live leaves, never types or traversal order. A partial
 * match is unsafe for a caller about to move leaves, so reject the whole tree.
 */
export function readDock(app: App, side: SidebarSide = 'right'): DockGroup[] {
  const split = sidebarSplit(app, side);
  const dock = app.workspace.getLayout()[side];
  if (split === null || !isRecord(dock) || !Array.isArray(dock.children)) return [];

  const live = new Map<string, WorkspaceLeaf>();
  let invalid = false;
  app.workspace.iterateAllLeaves((leaf) => {
    if (leaf.getRoot() !== split) return;
    if (typeof leaf.id !== 'string' || live.has(leaf.id)) invalid = true;
    else live.set(leaf.id, leaf);
  });
  if (invalid) return [];

  const groups: DockGroup[] = [];
  const seen = new Set<WorkspaceLeaf>();
  for (const raw of dock.children) {
    if (!isRecord(raw) || raw.type !== 'tabs' || typeof raw.id !== 'string') return [];
    if (!Array.isArray(raw.children) || raw.children.length === 0) return [];
    const leaves: WorkspaceLeaf[] = [];
    const views: string[] = [];
    let parent: WorkspaceParent | undefined;
    for (const node of raw.children) {
      if (!isRecord(node) || node.type !== 'leaf' || typeof node.id !== 'string') return [];
      if (!isRecord(node.state) || typeof node.state.type !== 'string') return [];
      const leaf = live.get(node.id);
      if (leaf === undefined || seen.has(leaf) || leaf.parent.id !== raw.id) return [];
      if (leaf.parent.parent !== split || leaf.view.getViewType() !== node.state.type) return [];
      if (parent !== undefined && parent !== leaf.parent) return [];
      parent = leaf.parent;
      leaves.push(leaf);
      views.push(node.state.type);
      seen.add(leaf);
    }
    const index = raw.currentTab ?? 0;
    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= leaves.length
    )
      return [];
    if (parent === undefined) return [];
    if (split.children?.[groups.length] !== parent) return [];
    const dimension = raw.dimension;
    if (
      dimension !== undefined &&
      (typeof dimension !== 'number' ||
        !Number.isFinite(dimension) ||
        dimension <= 0 ||
        dimension >= 100)
    )
      return [];
    groups.push({
      parent,
      leaves,
      views,
      revealed: views[index] ?? null,
      revealedLeaf: leaves[index] ?? null,
      dimension,
    });
  }
  return seen.size === live.size ? groups : [];
}

/** The live leaf showing a given view type inside one floor. */
export function leafOfView(group: DockGroup, viewType: string): WorkspaceLeaf | null {
  const index = group.views.indexOf(viewType);
  return group.leaves[index] ?? null;
}
