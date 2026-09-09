/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import { type App, Menu, type Plugin } from 'obsidian';
import { t } from './i18n';
import {
  applyArrangement,
  reconcileFloors,
  restoreArrangementFloors,
  revealedOnTop,
} from './layout/apply';
import { captureSidebar } from './layout/capture';
import { notify, reportError } from './logging';
import {
  type Arrangement,
  arrangementOf,
  type Button,
  declaredPanels,
  isLayout,
  isModified,
  type LayoutButton,
  moveInList,
  newId,
  type SidebarSide,
  sameArrangement,
} from './model';
import type { ReadonlyData, Store } from './store';
import { ButtonRow, type RowItem, sidebarDocument } from './ui/buttons';
import { applyManagedTabStyle } from './ui/managedTabs';
import { CommandSuggest, IconSuggest, SaveLayoutModal } from './ui/modals';
import { watchTopTab } from './ui/topTabWatcher';

/** How long the sidebar has to sit still before its shape is recorded. */
const SETTLE_MS = 700;

/** The slice of the controller the settings tab is allowed to use. */
export type SettingsHost = Pick<
  Controller,
  | 'app'
  | 'side'
  | 'apply'
  | 'capture'
  | 'data'
  | 'setFlag'
  | 'setVisible'
  | 'move'
  | 'remove'
  | 'createLayout'
  | 'addCommand'
  | 'edit'
  | 'reset'
  | 'promote'
  | 'moveTo'
>;

export class Controller {
  readonly app: App;
  private readonly plugin: Plugin;
  private readonly store: Store;
  private readonly row: ButtonRow;
  private unloading = false;

  /* Set while we are the ones changing the sidebar, so our own work does not
   * come back as if the user had done it. */
  private busy = false;
  private settleTimer: number | null = null;
  private pendingRecord = false;
  private recordVersion = 0;
  private operations: Promise<void> = Promise.resolve();
  private collapsedFor: string | null = null;
  private readonly isCancelled = (): boolean => this.unloading;

  constructor(
    plugin: Plugin,
    store: Store,
    readonly side: SidebarSide = 'right',
    private readonly refreshAll: () => void = () => this.refresh(),
  ) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.store = store;
    this.row = new ButtonRow(
      plugin,
      () => this.rowItems(),
      () => this.store.current.showTooltips,
      this.side,
    );
  }

  start(): void {
    this.row.start();

    for (const button of this.data.buttons) {
      if (!isLayout(button)) continue;
      try {
        this.syncCommand(button);
      } catch (error) {
        reportError(error, t('Registering command for "{name}"', { name: button.name }));
      }
    }

    watchTopTab(
      this.plugin,
      (shown) => {
        if (this.unloading || this.busy) return;
        this.row.sync();
        void this.fitNote(shown);
        this.scheduleRecord();
      },
      this.side,
    );
    this.plugin.registerEvent(this.app.workspace.on('layout-change', () => this.scheduleRecord()));
    /* Dragging a divider changes no structure, so `layout-change` stays silent -
     * measured, zero events. `resize` is the one that fires. */
    this.plugin.registerEvent(this.app.workspace.on('resize', () => this.scheduleRecord()));
    this.plugin.register(() => this.cancelRecord());

    this.app.workspace.onLayoutReady(() => {
      if (this.unloading) return;
      this.refresh();
      void this.fitNote(revealedOnTop(this.app, this.side));
    });
  }

  stop(): void {
    this.unloading = true;
    this.cancelRecord();
  }

  get data(): ReadonlyData {
    return {
      ...this.store.current,
      buttons: this.store.current.buttons.filter((button) => button.side === this.side),
    };
  }

  /* --------------------------------------------------------------- state */

  private find(id: string): Button | null {
    const button = this.store.find(id);
    return button?.side === this.side ? button : null;
  }

  private governingLayout(): LayoutButton | null {
    const button = this.find(this.store.current.governing[this.side] ?? '');
    return button !== null && isLayout(button) ? button : null;
  }

  /** Whether the sidebar is showing the layout in force, rather than a note or
   *  anything else the user opened on top of it. */
  private isShowing(layout: LayoutButton): boolean {
    return revealedOnTop(this.app, this.side) === arrangementOf(layout).home;
  }

  /* ----------------------------------------------------------------- row */

  private rowItems(): RowItem[] {
    const governing = this.governingLayout();
    const split =
      this.side === 'left' ? this.app.workspace.leftSplit : this.app.workspace.rightSplit;
    return this.data.buttons
      .filter((button) => button.visible)
      .map<RowItem>((button) => ({
        key: button.id,
        placement: button.placement,
        showWhenCollapsed: button.showWhenCollapsed,
        icon: button.icon,
        label: button.name,
        active: !split?.collapsed && governing?.id === button.id && this.isShowing(governing),
        onClick: () => this.run(button),
        onMenu: (event) => this.menu(button, event),
      }));
  }

  private run(button: Button): void {
    if (isLayout(button)) {
      void this.apply(button.id);
      return;
    }
    if (!this.app.commands.executeCommandById(button.commandId)) {
      notify(t('"{name}" is not available', { name: button.name }));
    }
  }

  private menu(button: Button, event: MouseEvent): void {
    const menu = new Menu();

    if (isLayout(button) && isModified(button)) {
      const layout = button;
      menu.addItem((item) =>
        item
          .setTitle(t('Save changes'))
          .setIcon('save')
          .onClick(() => void this.promote(layout.id)),
      );
      menu.addItem((item) =>
        item
          .setTitle(t('Restore saved layout'))
          .setIcon('rotate-ccw')
          .onClick(() => void this.reset(layout.id)),
      );
      menu.addSeparator();
    }

    if (isLayout(button)) {
      /* The tab header is also the drag handle, so hiding it takes away the way
       * layouts are arranged in the first place. The way back has to be where
       * the hand already is, not in the command palette. */
      const hidden = this.store.current.hideManagedTabs;
      menu.addItem((item) =>
        item
          .setTitle(t(hidden ? 'Show panel tabs' : 'Hide panel tabs'))
          .setIcon(hidden ? 'eye' : 'eye-off')
          .onClick(() => void this.setFlag('hideManagedTabs', !hidden)),
      );
      menu.addSeparator();
    }

    menu.addItem((item) =>
      item
        .setTitle(t('Delete'))
        .setIcon('trash')
        .setWarning(true)
        .onClick(() => void this.remove(button.id)),
    );
    menu.showAtMouseEvent(event);
  }

  /* ------------------------------------------------------------- applying */

  apply(id: string): Promise<void> {
    const requested = this.find(id);
    if (requested === null || !isLayout(requested)) return Promise.resolve();
    return this.enqueue(async () => {
      // Flush a real user change before the next layout replaces the live shape.
      if (this.pendingRecord) {
        this.cancelRecord();
        if (!(await this.record())) return;
      }
      const button = this.find(id);
      if (this.unloading || button === null || !isLayout(button)) return;
      this.busy = true;
      try {
        const cancelled = (): boolean => this.unloading || this.find(id) === null;
        const applied = await applyArrangement(
          this.app,
          arrangementOf(button),
          cancelled,
          this.side,
        );
        if (!applied || cancelled()) return;
        const saved = await this.store.update((data) => {
          if (
            data.buttons.some(
              (entry) => entry.id === id && entry.side === this.side && isLayout(entry),
            )
          )
            data.governing[this.side] = id;
        }, cancelled);
        if (!saved || cancelled()) return;
        this.collapsedFor = null;
        this.refresh();
      } finally {
        this.busy = false;
      }
    });
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.operations
      .then(async () => {
        if (!this.unloading) await operation();
      })
      .catch((error: unknown) => reportError(error, t('Updating sidebar')));
    this.operations = next;
    return next;
  }

  /* --------------------------------------------------------- auto-record */

  private cancelRecord(): void {
    if (this.settleTimer !== null) window.clearTimeout(this.settleTimer);
    this.settleTimer = null;
  }

  /* Dragging a divider fires no event of its own, and the ones that do fire
   * arrive in bursts, so the shape is read once the sidebar stops moving. */
  private scheduleRecord(): void {
    if (this.unloading || this.busy) return;
    this.cancelRecord();
    this.pendingRecord = true;
    this.recordVersion += 1;
    this.settleTimer = window.setTimeout(() => {
      this.settleTimer = null;
      void this.record().catch((error: unknown) => reportError(error, t('Recording layout')));
    }, SETTLE_MS);
  }

  /**
   * Remember what the user did to the sidebar.
   *
   * Only when the layout in force is the one on screen. Opening a note, or the
   * floors collapsing under it, is a temporary view of the layout - recording
   * that would make the layout itself become the temporary thing.
   */
  private async record(): Promise<boolean> {
    const version = this.recordVersion;
    const recorded = await this.captureRecord();
    if (recorded && version === this.recordVersion) this.pendingRecord = false;
    return recorded;
  }

  private async captureRecord(): Promise<boolean> {
    if (this.unloading || this.busy) return true;
    const layout = this.governingLayout();
    if (layout === null || this.collapsedFor === layout.id || !this.isShowing(layout)) return true;

    const shape = captureSidebar(this.app, this.side);
    if (shape.home === null) return true;
    if (sameArrangement(shape, arrangementOf(layout))) return true;

    return this.write(layout.id, (entry) =>
      sameArrangement(shape, entry.saved) ? strip(entry) : { ...entry, working: shape },
    );
  }

  /* ----------------------------------------------------------- saved vs working */

  reset = async (id: string): Promise<void> => {
    const layout = this.find(id);
    if (layout === null || !isLayout(layout)) return;
    if (this.store.current.governing[this.side] === id) {
      this.cancelRecord();
      this.pendingRecord = false;
    }
    if (!(await this.write(id, strip))) return;
    if (this.store.current.governing[this.side] === id) await this.apply(id);
  };

  promote = async (id: string): Promise<void> => {
    if (this.pendingRecord && this.store.current.governing[this.side] === id) {
      this.cancelRecord();
      if (!(await this.record())) return;
    }
    await this.write(id, (entry) =>
      entry.working === undefined ? entry : strip({ ...entry, saved: entry.working }),
    );
  };

  private async write(
    id: string,
    change: (layout: LayoutButton) => LayoutButton,
  ): Promise<boolean> {
    if (this.unloading || this.find(id)?.kind !== 'layout') return false;
    const saved = await this.store.update((data) => {
      const index = data.buttons.findIndex((entry) => entry.id === id && entry.side === this.side);
      const existing = data.buttons[index];
      if (existing !== undefined && isLayout(existing)) data.buttons[index] = change(existing);
    }, this.isCancelled);
    if (saved) this.refresh();
    return saved;
  }

  /* ------------------------------------------------------------- creating */

  createLayout = (onCreated: () => void = () => undefined): void => {
    if (this.unloading) return;
    const shape = structuredClone(captureSidebar(this.app, this.side));
    if (shape.home === null && shape.floors.length === 0) {
      notify(
        t(
          this.side === 'left'
            ? 'the left sidebar is empty, nothing to save'
            : 'the right sidebar is empty, nothing to save',
        ),
      );
      return;
    }

    new SaveLayoutModal(this.app, this.side, shape, (name, icon) => {
      void this.add({
        kind: 'layout',
        side: this.side,
        placement: 'header',
        showWhenCollapsed: false,
        id: newId(),
        name,
        icon,
        visible: true,
        saved: shape,
        fullWidthNotes: false,
        registerCommand: true,
      }).then((saved) => {
        if (saved && !this.unloading) onCreated();
      });
    }).open();
  };

  addCommand = (onAdded: () => void): void => {
    if (this.unloading) return;
    new CommandSuggest(this.app, (command) => {
      new IconSuggest(this.app, (icon) => {
        void this.add({
          kind: 'command',
          side: this.side,
          placement: 'header',
          showWhenCollapsed: false,
          id: newId(),
          name: command.name,
          icon,
          visible: true,
          commandId: command.id,
        }).then((saved) => {
          if (saved && !this.unloading) onAdded();
        });
      }).open();
    }).open();
  };

  /* ------------------------------------------------------------ list CRUD */

  private async add(button: Button): Promise<boolean> {
    if (this.unloading || button.side !== this.side) return false;
    if (
      !(await this.store.update((data) => {
        data.buttons.push(button);
      }, this.isCancelled)) ||
      this.unloading
    )
      return false;
    if (isLayout(button)) this.syncCommand(button);
    this.refresh();
    return true;
  }

  async edit(id: string, change: (button: Button) => Button): Promise<void> {
    if (this.unloading || this.find(id) === null) return;
    if (
      !(await this.store.update((data) => {
        const index = data.buttons.findIndex(
          (entry) => entry.id === id && entry.side === this.side,
        );
        const existing = data.buttons[index];
        if (existing === undefined) return;
        const updated = change(structuredClone(existing));
        if (
          updated.id !== existing.id ||
          updated.side !== existing.side ||
          updated.kind !== existing.kind
        )
          return;
        data.buttons[index] = updated;
      }, this.isCancelled)) ||
      this.unloading
    )
      return;
    const updated = this.find(id);
    if (updated !== null && isLayout(updated)) {
      this.syncCommand(updated);
      if (this.store.current.governing[this.side] === id)
        await this.fitNote(revealedOnTop(this.app, this.side));
    }
    this.refresh();
  }

  remove = async (id: string): Promise<void> => {
    if (this.unloading || this.find(id) === null) return;
    if (
      !(await this.store.update((data) => {
        data.buttons = data.buttons.filter((entry) => entry.id !== id);
        if (data.governing[this.side] === id) data.governing[this.side] = null;
      }, this.isCancelled)) ||
      this.unloading
    )
      return;
    this.app.commands.removeCommand(this.commandId(id));
    this.refresh();
  };

  move = async (id: string, delta: number): Promise<void> => {
    if (this.unloading || this.find(id) === null) return;
    if (
      await this.store.update((data) => {
        const own = data.buttons.filter((button) => button.side === this.side);
        moveInList(own, id, delta);
        let index = 0;
        data.buttons = data.buttons.map((button) =>
          button.side === this.side ? (own[index++] ?? button) : button,
        );
      }, this.isCancelled)
    )
      this.refresh();
  };

  /** Resolve side-local drag positions before queued writes can change them. */
  moveTo = async (from: number, to: number): Promise<void> => {
    if (this.unloading || !Number.isInteger(from) || !Number.isInteger(to)) return;
    const source = this.data.buttons[from]?.id;
    const target = this.data.buttons[to]?.id;
    if (source === undefined || target === undefined) return;
    if (
      !(await this.store.update((data) => {
        const own = data.buttons.filter((button) => button.side === this.side);
        const sourceIndex = own.findIndex((button) => button.id === source);
        const targetIndex = own.findIndex((button) => button.id === target);
        if (sourceIndex < 0 || targetIndex < 0) return;
        moveInList(own, source, targetIndex - sourceIndex);
        let index = 0;
        data.buttons = data.buttons.map((button) =>
          button.side === this.side ? (own[index++] ?? button) : button,
        );
      }, this.isCancelled))
    )
      return;
    this.refresh();
  };

  setVisible = (id: string, visible: boolean): Promise<void> =>
    this.edit(id, (button) => ({ ...button, visible }));

  setFlag = async (key: 'hideManagedTabs' | 'showTooltips', value: boolean): Promise<void> => {
    if (this.unloading) return;
    if (
      !(await this.store.update((data) => {
        data[key] = value;
      }, this.isCancelled))
    )
      return;
    this.refreshAll();
  };

  /* ------------------------------------------------------------- the note */

  private fitNote(shown: string | null): Promise<void> {
    if (shown === null) return Promise.resolve();
    return this.enqueue(async () => {
      const layout = this.governingLayout();
      if (layout === null) return;
      const collapse = layout.fullWidthNotes && revealedOnTop(this.app, this.side) === 'markdown';
      if (!collapse && this.collapsedFor !== layout.id) return;
      this.busy = true;
      try {
        const shape = arrangementOf(layout);
        const cancelled = (): boolean =>
          this.unloading || this.store.current.governing[this.side] !== layout.id;
        const applied = collapse
          ? await reconcileFloors(this.app, [], cancelled, this.side)
          : await restoreArrangementFloors(this.app, shape, cancelled, this.side);
        if (applied && !cancelled()) this.collapsedFor = collapse ? layout.id : null;
      } finally {
        this.busy = false;
      }
    });
  }

  /* ------------------------------------------------------------- plumbing */

  private commandId(id: string): string {
    return `${this.plugin.manifest.id}:apply-${id}`;
  }

  private syncCommand(layout: LayoutButton): void {
    if (this.unloading) return;
    try {
      if (!layout.registerCommand) {
        this.app.commands.removeCommand(this.commandId(layout.id));
        return;
      }
      this.plugin.addCommand({
        id: `apply-${layout.id}`,
        name: layout.name,
        callback: () => void this.apply(layout.id),
      });
    } catch (error) {
      reportError(error, t('Registering command for "{name}"', { name: layout.name }));
    }
  }

  refresh(): void {
    if (this.unloading) return;
    this.row.sync();
    applyManagedTabStyle(
      sidebarDocument(this.app, this.side),
      declaredPanels(this.data.buttons),
      this.store.current.hideManagedTabs,
      this.side,
    );
  }

  capture(): Arrangement {
    return captureSidebar(this.app, this.side);
  }

  layouts(): LayoutButton[] {
    return structuredClone(this.data.buttons.filter(isLayout));
  }
}

/** The same layout with no working shape, so it shows its default again. */
function strip(layout: LayoutButton): LayoutButton {
  const { working, ...rest } = layout;
  void working;
  return rest;
}
