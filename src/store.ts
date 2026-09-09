/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import type { Plugin } from 'obsidian';
import { t } from './i18n';
import { reportError } from './logging';
import {
  type Arrangement,
  type Button,
  type ButtonPlacement,
  DEFAULT_DATA,
  type Floor,
  type PluginData,
  type SidebarSide,
} from './model';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/* An empty string is not a usable name or icon - it draws a button with nothing
 * on it and nothing to read out - so it takes the default the same as an absent
 * value does. Found by the property tests, not by hand. */
function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100;
}

function readFloors(raw: unknown): Floor[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.view !== 'string' || entry.view.length === 0) return [];
    const dimension = entry.dimension;
    return [isDimension(dimension) ? { view: entry.view, dimension } : { view: entry.view }];
  });
}

export function readArrangement(raw: unknown): Arrangement | null {
  if (!isRecord(raw)) return null;
  const home = typeof raw.home === 'string' ? raw.home : null;
  const floors = readFloors(raw.floors);
  const homeDimension = raw.homeDimension;
  return isDimension(homeDimension) ? { home, homeDimension, floors } : { home, floors };
}

export function readButton(raw: unknown): Button | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id.length === 0) return null;
  /* Which sidebar a button belongs to, and where in it, are written on every
   * button. Neither has a neutral default, so an entry missing one is skipped
   * rather than assigned a side it was never given. */
  if (raw.side !== 'left' && raw.side !== 'right') return null;
  if (raw.placement !== 'header' && raw.placement !== 'panel') return null;
  const side: SidebarSide = raw.side;
  const placement: ButtonPlacement = raw.placement;
  const id = raw.id;
  const name = str(raw.name, id);
  const visible = bool(raw.visible, true);
  const showWhenCollapsed = bool(raw.showWhenCollapsed, false);

  if (raw.kind === 'command') {
    const commandId = raw.commandId;
    if (typeof commandId !== 'string' || commandId.length === 0) return null;
    return {
      kind: 'command',
      id,
      side,
      placement,
      showWhenCollapsed,
      name,
      icon: str(raw.icon, 'terminal'),
      visible,
      commandId,
    };
  }

  if (raw.kind !== undefined && raw.kind !== 'layout') return null;
  const saved = readArrangement(raw.saved);
  if (saved === null) return null;
  const working = readArrangement(raw.working);

  const layout = {
    kind: 'layout' as const,
    id,
    side,
    placement,
    showWhenCollapsed,
    name,
    icon: str(raw.icon, 'layout-panel-left'),
    visible,
    saved,
    fullWidthNotes: bool(raw.fullWidthNotes, false),
    registerCommand: bool(raw.registerCommand, true),
  };
  return working === null ? layout : { ...layout, working };
}

export function readData(raw: unknown): PluginData {
  if (!isRecord(raw))
    return { ...DEFAULT_DATA, buttons: [], governing: { left: null, right: null } };

  const ids = new Set<string>();
  const buttons = Array.isArray(raw.buttons)
    ? raw.buttons.flatMap((entry) => {
        const parsed = readButton(entry);
        if (parsed === null || ids.has(parsed.id)) return [];
        ids.add(parsed.id);
        return [parsed];
      })
    : [];

  const governing = isRecord(raw.governing) ? raw.governing : {};
  const governingFor = (side: SidebarSide): string | null =>
    buttons.find(
      (button) => button.kind === 'layout' && button.side === side && button.id === governing[side],
    )?.id ?? null;

  return {
    buttons,
    governing: { left: governingFor('left'), right: governingFor('right') },
    hideManagedTabs: bool(raw.hideManagedTabs, DEFAULT_DATA.hideManagedTabs),
    showTooltips: bool(raw.showTooltips, DEFAULT_DATA.showTooltips),
  };
}

/** An absent optional field takes its default; a malformed present shape must not be overwritten. */
function validStoredArrangement(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  if (
    raw.home !== undefined &&
    raw.home !== null &&
    (typeof raw.home !== 'string' || raw.home.length === 0)
  )
    return false;
  if (raw.homeDimension !== undefined && !isDimension(raw.homeDimension)) return false;
  if (raw.floors === undefined) return true;
  return (
    Array.isArray(raw.floors) &&
    raw.floors.every(
      (floor) =>
        isRecord(floor) &&
        typeof floor.view === 'string' &&
        floor.view.length > 0 &&
        (floor.dimension === undefined || isDimension(floor.dimension)),
    )
  );
}

function validStoredButtons(raw: unknown, parsed: readonly Button[]): boolean {
  if (raw === undefined) return true;
  if (!Array.isArray(raw) || raw.length !== parsed.length) return false;
  return raw.every(
    (entry) =>
      isRecord(entry) &&
      (entry.kind === 'command' ||
        (validStoredArrangement(entry.saved) &&
          (entry.working === undefined ||
            entry.working === null ||
            validStoredArrangement(entry.working)))),
  );
}

function validStoredGoverning(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  if (!isRecord(raw)) return false;
  return (
    Object.keys(raw).every((key) => key === 'left' || key === 'right') &&
    (raw.left === null || typeof raw.left === 'string') &&
    (raw.right === null || typeof raw.right === 'string')
  );
}

/** A read-only view of the data, arrays included. */
export interface ReadonlyData {
  readonly buttons: readonly Button[];
  readonly governing: Readonly<Record<SidebarSide, string | null>>;
  readonly hideManagedTabs: boolean;
  readonly showTooltips: boolean;
}

/**
 * Reads and writes `data.json`.
 *
 * Every field is validated on the way in: this file syncs between machines and
 * gets edited by hand, and a malformed entry has to fall back to a default
 * rather than throw during `onload`.
 */
export class Store {
  private readonly plugin: Plugin;
  private data: PluginData = readData(null);
  private writes: Promise<void> = Promise.resolve();
  private writable = true;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  get current(): ReadonlyData {
    return this.data;
  }

  get visible(): readonly Button[] {
    return this.data.buttons.filter((button) => button.visible);
  }

  async load(): Promise<void> {
    try {
      const raw: unknown = await this.plugin.loadData();
      this.data = readData(raw);
      // Salvage readable layouts, but never overwrite entries that failed to load.
      this.writable =
        raw === null ||
        raw === undefined ||
        (isRecord(raw) &&
          validStoredButtons(raw.buttons, this.data.buttons) &&
          validStoredGoverning(raw.governing));
      if (!this.writable)
        reportError(
          new Error(
            t(
              'Invalid saved data; writes are disabled until the file is repaired and the plugin reloaded',
            ),
          ),
          t('Loading layouts'),
        );
    } catch (error) {
      this.writable = false;
      reportError(error, t('Loading layouts; writes are disabled until the plugin is reloaded'));
    }
  }

  update(
    change: (data: PluginData) => void,
    cancelled: () => boolean = () => false,
  ): Promise<boolean> {
    const write = this.writes.then(async () => {
      if (!this.writable || cancelled()) return false;
      const next = structuredClone(this.data);
      try {
        change(next);
        if (cancelled()) return false;
        await this.plugin.saveData(next);
        if (cancelled()) return false;
        this.data = next;
        return true;
      } catch (error) {
        reportError(error, t('Saving layouts'));
        return false;
      }
    });
    this.writes = write.then(() => undefined);
    return write;
  }

  find(id: string): Button | null {
    return this.data.buttons.find((button) => button.id === id) ?? null;
  }
}
