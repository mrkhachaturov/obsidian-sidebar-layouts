/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import { Plugin } from 'obsidian';
import { Controller } from './controller';
import { t } from './i18n';
import { notify } from './logging';
import type { LayoutButton, SidebarSide } from './model';
import { Store } from './store';
import { sidebarDocument } from './ui/buttons';
import { removeManagedTabStyle } from './ui/managedTabs';
import { LayoutSuggest } from './ui/modals';
import { SidebarLayoutsSettingTab } from './ui/settings';

export default class SidebarLayoutsPlugin extends Plugin {
  private readonly store = new Store(this);
  private controllers: Record<SidebarSide, Controller> | null = null;
  private unloading = false;

  readonly api = {
    version: 1,
    list: (side?: SidebarSide): readonly LayoutButton[] => {
      if (this.controllers === null) return [];
      return structuredClone(
        this.store.current.buttons.filter(
          (button): button is LayoutButton =>
            button.kind === 'layout' && (side === undefined || button.side === side),
        ),
      );
    },
    governing: (side: SidebarSide): string | null =>
      this.controllers === null ? null : this.store.current.governing[side],
    apply: (id: string): Promise<void> => {
      const button = this.store.find(id);
      return button === null
        ? Promise.resolve()
        : (this.controllers?.[button.side].apply(id) ?? Promise.resolve());
    },
    capture: (side: SidebarSide) => this.controllers?.[side].capture(),
  };

  override async onload(): Promise<void> {
    this.unloading = false;
    await this.store.load();
    if (this.unloading) return;

    const refreshAll = (): void => {
      for (const controller of Object.values(this.controllers ?? {})) controller.refresh();
    };
    const controllers = {
      left: new Controller(this, this.store, 'left', refreshAll),
      right: new Controller(this, this.store, 'right', refreshAll),
    };
    this.controllers = controllers;
    controllers.left.start();
    controllers.right.start();

    this.addSettingTab(new SidebarLayoutsSettingTab(controllers, this));
    this.addCommands(controllers.right);
    this.addCommands(controllers.left);
  }

  /* Leaves are not detached here, per Obsidian's guidance. */
  override onunload(): void {
    this.unloading = true;
    for (const side of ['left', 'right'] as const) {
      this.controllers?.[side].stop();
      removeManagedTabStyle(sidebarDocument(this.app, side), side);
    }
    this.controllers = null;
  }

  private addCommands(controller: Controller): void {
    this.addCommand({
      id: `apply-${controller.side}`,
      name: t(
        controller.side === 'left' ? 'Switch left sidebar layout' : 'Switch right sidebar layout',
      ),
      callback: () =>
        this.pick(
          controller,
          t(
            controller.side === 'left'
              ? 'Switch left sidebar to which layout?'
              : 'Switch right sidebar to which layout?',
          ),
          (l) => void controller.apply(l.id),
        ),
    });

    this.addCommand({
      id: `save-as-new-${controller.side}`,
      name: t(
        controller.side === 'left'
          ? 'New layout from the left sidebar'
          : 'New layout from the right sidebar',
      ),
      callback: () => controller.createLayout(),
    });
  }

  private pick(
    controller: Controller,
    placeholder: string,
    onChoose: (layout: LayoutButton) => void,
  ): void {
    const layouts = controller.layouts();
    if (layouts.length === 0) {
      notify(t('no layouts saved yet'));
      return;
    }
    new LayoutSuggest(this.app, layouts, placeholder, onChoose).open();
  }
}
