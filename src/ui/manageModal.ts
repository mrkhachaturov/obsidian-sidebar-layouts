/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import { type App, Modal } from 'obsidian';
import { h } from 'preact';
import { t } from '../i18n';
import type { Button, SidebarSide } from '../model';
import { ManageButtons } from './ManageButtons';
import { mountIsland } from './mountIsland';

/* Notebook Navigator edits its vault profiles this way: one modal holding the
 * whole list, with the order changed where the order is visible. */

export interface ManageActions {
  readonly side: SidebarSide;
  readonly list: () => readonly Button[];
  readonly rename: (id: string, name: string) => Promise<void>;
  readonly move: (from: number, to: number) => Promise<void>;
  readonly remove: (id: string) => Promise<void>;
  readonly addLayout: (onAdded: () => void) => void;
  readonly addCommand: (onAdded: () => void) => void;
}

export class ManageButtonsModal extends Modal {
  private readonly actions: ManageActions;
  private dispose: (() => void) | null = null;
  private readonly closeEditor = (): void => {
    this.onClose();
  };

  constructor(app: App, actions: ManageActions) {
    super(app);
    this.actions = actions;
  }

  override onOpen(): void {
    this.onClose();
    this.setTitle(
      t(this.actions.side === 'left' ? 'Left sidebar buttons' : 'Right sidebar buttons'),
    );
    this.modalEl.addClass('sl-manage-modal');
    this.dispose = mountIsland(this.contentEl, h(ManageButtons, { actions: this.actions }));
    this.contentEl.ownerDocument.defaultView?.addEventListener('unload', this.closeEditor);
  }

  override onClose(): void {
    this.contentEl.ownerDocument.defaultView?.removeEventListener('unload', this.closeEditor);
    this.dispose?.();
    this.dispose = null;
    this.modalEl.removeClass('sl-manage-modal');
    this.contentEl.empty();
  }
}
