/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import {
  type App,
  type Command,
  FuzzySuggestModal,
  getIconIds,
  Modal,
  Setting,
  setIcon,
} from 'obsidian';
import { t } from '../i18n';
import type { Arrangement, LayoutButton, SidebarSide } from '../model';
import { layoutPanels, sideLabel } from './labels';

/** Pick one of the saved layouts. */
export class LayoutSuggest extends FuzzySuggestModal<LayoutButton> {
  private readonly layouts: readonly LayoutButton[];
  private readonly onChoose: (layout: LayoutButton) => void;

  constructor(
    app: App,
    layouts: readonly LayoutButton[],
    placeholder: string,
    onChoose: (layout: LayoutButton) => void,
  ) {
    super(app);
    this.layouts = layouts;
    this.onChoose = onChoose;
    this.setPlaceholder(placeholder);
  }

  getItems(): LayoutButton[] {
    return [...this.layouts];
  }

  getItemText(layout: LayoutButton): string {
    return layout.name;
  }

  onChooseItem(layout: LayoutButton): void {
    this.onChoose(layout);
  }
}

export class IconSuggest extends FuzzySuggestModal<string> {
  private readonly onChoose: (icon: string) => void;

  constructor(app: App, onChoose: (icon: string) => void) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder(t('Search icons'));
  }

  getItems(): string[] {
    return getIconIds();
  }

  getItemText(icon: string): string {
    return icon.replace(/^lucide-/, '');
  }

  override renderSuggestion(match: { item: string }, element: HTMLElement): void {
    const row = element.createDiv({ cls: 'sl-icon-row' });
    setIcon(row.createSpan({ cls: 'sl-icon-preview' }), match.item);
    row.createSpan({ text: this.getItemText(match.item) });
  }

  onChooseItem(icon: string): void {
    this.onChoose(icon);
  }
}

/** Pick any command Obsidian knows about, core or from another plugin. */
export class CommandSuggest extends FuzzySuggestModal<Command> {
  private readonly onChoose: (command: Command) => void;

  constructor(app: App, onChoose: (command: Command) => void) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder(t('Choose a command'));
  }

  getItems(): Command[] {
    return Object.values(this.app.commands.commands);
  }

  getItemText(command: Command): string {
    return command.name;
  }

  override renderSuggestion(match: { item: Command }, element: HTMLElement): void {
    const row = element.createDiv({ cls: 'sl-icon-row' });
    if (match.item.icon !== undefined) {
      setIcon(row.createSpan({ cls: 'sl-icon-preview' }), match.item.icon);
    }
    row.createSpan({ text: match.item.name });
  }

  onChooseItem(command: Command): void {
    this.onChoose(command);
  }
}

/** Capture review, name and icon in one save dialog. */
export class SaveLayoutModal extends Modal {
  private readonly side: SidebarSide;
  private readonly shape: Arrangement;
  private readonly onSubmit: (name: string, icon: string) => void;
  private value = '';
  private icon = 'layout-dashboard';
  private generation = 0;
  private openGeneration: number | null = null;
  private input: HTMLInputElement | null = null;
  private error: HTMLElement | null = null;

  constructor(
    app: App,
    side: SidebarSide,
    shape: Arrangement,
    onSubmit: (name: string, icon: string) => void,
  ) {
    super(app);
    this.side = side;
    this.shape = { ...shape, floors: shape.floors.map((floor) => ({ ...floor })) };
    this.onSubmit = onSubmit;
  }

  override onOpen(): void {
    this.contentEl.empty();
    const generation = ++this.generation;
    this.openGeneration = generation;
    this.setTitle(
      t(this.side === 'left' ? 'Save left sidebar layout' : 'Save right sidebar layout'),
    );
    const summary = this.contentEl.createDiv({ cls: 'sl-save-layout-summary' });
    summary.createEl('p', {
      text: t('{side} · Captured arrangement, top to bottom', { side: sideLabel(this.side) }),
    });
    const panels = layoutPanels(this.app, this.shape, this.side);
    if (panels.length === 0) summary.createEl('p', { text: t('No panels in this sidebar.') });
    else {
      const list = summary.createEl('ol');
      for (const panel of panels) {
        list.createEl('li', {
          text: panel.height.length > 0 ? `${panel.label} (${panel.height})` : panel.label,
        });
      }
    }
    new Setting(this.contentEl).setName(t('Name')).addText((text) => {
      text.setValue(this.value).onChange((value) => {
        if (this.openGeneration !== generation) return;
        this.value = value;
        this.input?.removeAttribute('aria-invalid');
        if (this.error !== null) this.error.textContent = '';
      });
      this.input = text.inputEl;
      text.inputEl.setAttribute('aria-label', t('Layout name'));
      text.inputEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.isComposing) {
          event.preventDefault();
          this.submit(generation);
        }
      });
    });
    const iconSetting = new Setting(this.contentEl).setName(t('Icon'));
    const iconPreview = iconSetting.controlEl.createDiv({ cls: 'sl-icon-preview-large' });
    const showIcon = (): void => {
      iconPreview.empty();
      iconPreview.setAttribute('aria-label', t('Layout icon: {icon}', { icon: this.icon }));
      setIcon(iconPreview, this.icon);
    };
    showIcon();
    iconSetting.addButton((button) =>
      button.setButtonText(t('Change icon')).onClick(() => {
        if (this.openGeneration !== generation) return;
        new IconSuggest(this.app, (icon) => {
          if (this.openGeneration !== generation) return;
          this.icon = icon;
          showIcon();
        }).open();
      }),
    );
    this.error = this.contentEl.createDiv({ cls: 'sl-save-layout-error' });
    this.error.setAttribute('role', 'alert');
    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText(t('Cancel')).onClick(() => {
          if (this.openGeneration === generation) this.close();
        }),
      )
      .addButton((button) =>
        button
          .setButtonText(t('Save layout'))
          .setCta()
          .onClick(() => this.submit(generation)),
      );
    this.input?.focus();
  }

  private submit(generation: number): void {
    if (this.openGeneration !== generation) return;
    const name = this.value.trim();
    if (name.length === 0) {
      if (this.error !== null) this.error.textContent = t('Enter a layout name.');
      this.input?.setAttribute('aria-invalid', 'true');
      this.input?.focus();
      return;
    }
    const icon = this.icon;
    this.close();
    this.onSubmit(name, icon);
  }

  override onClose(): void {
    this.openGeneration = null;
    this.input = null;
    this.error = null;
    this.contentEl.empty();
  }
}
