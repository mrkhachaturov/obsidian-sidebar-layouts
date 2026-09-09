/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import type { Command, EventRef } from 'obsidian';

/* Not in obsidian.d.ts. Everything the plugin uses outside the public API is
 * declared here so the boundary is one file rather than casts spread around. */
declare module 'obsidian' {
  interface Workspace {
    /** Native toggles move between sidebar and central headers on collapse. */
    readonly leftSidebarToggleButtonEl?: HTMLElement;
    readonly rightSidebarToggleButtonEl?: HTMLElement;
    on(name: 'window-frame-change', callback: () => void): EventRef;
  }

  interface App {
    commands: {
      commands: Record<string, Command>;
      executeCommandById: (id: string) => boolean;
      removeCommand: (id: string) => void;
    };
    /** Checked at runtime before creating a view; unknown types otherwise open a ghost pane. */
    viewRegistry?: {
      getViewCreatorByType?: (type: string) => unknown;
    };
  }

  interface WorkspaceItem {
    /** Serialized identity, used instead of matching panels by their view types. */
    readonly id?: string;
    dimension?: number | null;
  }

  interface WorkspaceParent {
    /** Private host APIs: only the guarded adapter in layout/host.ts calls these. */
    children?: WorkspaceItem[];
    insertChild?: (index: number, child: WorkspaceItem) => void;
    removeChild?: (child: WorkspaceItem) => void;
    recomputeChildrenDimensions?: () => void;
  }
}
