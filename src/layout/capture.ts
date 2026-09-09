/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import type { App } from 'obsidian';
import type { Arrangement, Floor, SidebarSide } from '../model';
import { readDock } from './dock';

/** The selected sidebar as it looks now. */
export function captureSidebar(app: App, side: SidebarSide = 'right'): Arrangement {
  const groups = readDock(app, side);
  const [home, ...rest] = groups;

  const floors: Floor[] = [];
  for (const group of rest) {
    if (group.revealed === null) continue;
    floors.push(
      group.dimension === undefined
        ? { view: group.revealed }
        : { view: group.revealed, dimension: group.dimension },
    );
  }

  const home_ = home?.revealed ?? null;
  const homeDimension = home?.dimension;
  return homeDimension === undefined
    ? { home: home_, floors }
    : { home: home_, homeDimension, floors };
}
