/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import { type App, Menu, type Plugin, setIcon, setTooltip } from 'obsidian';
import { t } from '../i18n';
import type { ButtonPlacement, SidebarSide } from '../model';

let labelSequence = 0;

/** Resolve the selected sidebar independently of the focused window. */
export function sidebarDocument(app: App, side: SidebarSide = 'right'): Document {
  return sidebarContainer(app, side)?.ownerDocument ?? document;
}

export interface RowItem {
  readonly key: string;
  readonly icon: string;
  readonly label: string;
  readonly active: boolean;
  readonly placement: ButtonPlacement;
  readonly showWhenCollapsed: boolean;
  readonly onClick: () => void;
  readonly onMenu: (event: MouseEvent) => void;
}

export function sidebarContainer(app: App, side: SidebarSide = 'right'): HTMLElement | null {
  const split = side === 'left' ? app.workspace.leftSplit : app.workspace.rightSplit;
  const container = split && 'containerEl' in split ? split.containerEl : null;
  if (
    container === null ||
    typeof container !== 'object' ||
    !('nodeType' in container) ||
    container.nodeType !== 1
  )
    return null;
  return container as HTMLElement;
}

/** What a button was last drawn with, so an unchanged one is left alone. */
function fingerprint(item: RowItem, tooltips: boolean): string {
  return `${item.icon}\u0000${item.label}\u0000${item.active}\u0000${tooltips}`;
}

export class ButtonRow {
  private active = false;
  private readonly plugin: Plugin;
  private readonly items: () => readonly RowItem[];
  private readonly tooltips: () => boolean;
  private readonly elements = new Map<string, HTMLElement>();
  private readonly painted = new Map<string, string>();
  private readonly strips = new Map<ButtonPlacement, HTMLElement>();
  private readonly resizes = new Map<ButtonPlacement, ResizeObserver>();
  private readonly overflows = new Map<ButtonPlacement, HTMLButtonElement>();
  private readonly side: SidebarSide;
  /* The element the header strip sits in, marked so the native tabs give up
   * space to it. A class we set ourselves, rather than `:has()`: this container
   * changes on every tab opened, closed or dragged, and a relational selector
   * makes the browser re-evaluate the whole subtree each time. */
  private host: HTMLElement | null = null;

  constructor(
    plugin: Plugin,
    items: () => readonly RowItem[],
    tooltips: () => boolean,
    side: SidebarSide = 'right',
  ) {
    this.side = side;
    this.plugin = plugin;
    this.items = items;
    this.tooltips = tooltips;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.plugin.register(() => {
      this.active = false;
      this.removeAll();
    });
    this.plugin.app.workspace.onLayoutReady(() => {
      if (!this.active) return;
      this.sync();
      this.plugin.registerEvent(this.plugin.app.workspace.on('layout-change', () => this.sync()));
      this.plugin.registerEvent(
        this.plugin.app.workspace.on('window-frame-change', () => this.sync()),
      );
    });
  }

  sync(): void {
    if (!this.active) return;
    const items = this.visibleItems();
    const wanted = new Set(items.map((item) => item.key));
    for (const [key, element] of this.elements) {
      if (wanted.has(key)) continue;
      element.remove();
      this.elements.delete(key);
      this.painted.delete(key);
    }
    const workspace = this.plugin.app.workspace;
    const toggle =
      this.side === 'left'
        ? workspace.leftSidebarToggleButtonEl
        : workspace.rightSidebarToggleButtonEl;
    const panelHeader = sidebarContainer(this.plugin.app, this.side)?.querySelector<HTMLElement>(
      '.workspace-tab-header-container',
    );
    for (const placement of ['header', 'panel'] as const) {
      const selected = items.filter((item) => item.placement === placement);
      const anchor = placement === 'header' ? toggle : panelHeader;
      if (!anchor?.isConnected || anchor.parentElement === null || selected.length === 0) {
        this.removeStrip(placement);
        continue;
      }
      const strip = this.ensureStrip(anchor, placement);
      for (const item of selected) {
        const existing = this.elements.get(item.key);
        if (existing === undefined) this.elements.set(item.key, this.create(item, strip));
        else {
          strip.appendChild(existing);
          this.paint(existing, item);
        }
      }
      this.fitButtons(placement);
    }
  }

  private ensureStrip(anchor: HTMLElement, placement: ButtonPlacement): HTMLElement {
    let strip = this.strips.get(placement);
    if (strip === undefined || strip.ownerDocument !== anchor.ownerDocument) {
      this.removeStrip(placement);
      strip = anchor.createDiv({ cls: 'sl-button-strip' });
      strip.classList.add(placement === 'header' ? 'sl-header-buttons' : 'sl-panel-buttons');
      strip.dataset.placement = placement;
      strip.dataset.side = this.side;
      strip.setAttribute('role', 'group');
      strip.setAttribute(
        'aria-label',
        `${this.side === 'left' ? t('Left sidebar buttons') : t('Right sidebar buttons')} · ${placement === 'header' ? t('In the window header') : t('Below panel tabs')}`,
      );
      this.strips.set(placement, strip);
      const owner = anchor.ownerDocument.defaultView;
      if (placement === 'panel' && owner && typeof owner.ResizeObserver === 'function') {
        const observer = new owner.ResizeObserver(() => {
          if (this.active) this.fitButtons(placement);
        });
        this.resizes.set(placement, observer);
        observer.observe(strip);
      }
    }
    // Native toggles move on collapse; their animation clones are not anchors.
    if (placement === 'panel') {
      if (anchor.nextElementSibling !== strip) anchor.after(strip);
    } else if (this.side === 'left') {
      if (sidebarContainer(this.plugin.app, this.side)?.contains(anchor)) {
        const parent = anchor.parentElement;
        if (parent?.firstElementChild !== strip) parent?.prepend(strip);
      } else if (anchor.nextElementSibling !== strip) anchor.after(strip);
    } else if (anchor.previousElementSibling !== strip) anchor.before(strip);
    if (placement === 'header') this.markHost(strip.parentElement);
    return strip;
  }

  /** Moves the marker classes to the element now holding the header strip. */
  private markHost(host: HTMLElement | null): void {
    if (this.host === host) return;
    this.clearHost();
    this.host = host;
    host?.classList.add('sl-hosts-buttons');
    if (this.side === 'left') host?.classList.add('sl-hosts-buttons-left');
  }

  private clearHost(): void {
    this.host?.classList.remove('sl-hosts-buttons', 'sl-hosts-buttons-left');
    this.host = null;
  }

  private visibleItems(): readonly RowItem[] {
    const workspace = this.plugin.app.workspace;
    const split = this.side === 'left' ? workspace.leftSplit : workspace.rightSplit;
    return this.items().filter(
      (item) => item.placement !== 'header' || !split?.collapsed || item.showWhenCollapsed,
    );
  }

  private fitButtons(placement: ButtonPlacement): void {
    const strip = this.strips.get(placement);
    if (strip === undefined) return;
    const ordered = this.visibleItems()
      .filter((item) => item.placement === placement)
      .flatMap((item) => {
        const button = this.elements.get(item.key);
        return button ? [button] : [];
      });
    for (const button of ordered) button.hidden = false;
    this.overflows.get(placement)?.remove();
    // Header shortcuts keep their full width; only native tabs yield space.
    if (placement === 'header') return;
    const style = strip.ownerDocument.defaultView?.getComputedStyle(strip);
    const width =
      strip.clientWidth -
      (parseFloat(style?.paddingLeft ?? '') || 0) -
      (parseFloat(style?.paddingRight ?? '') || 0);
    // Closed panels and unlaid-out documents have no measurable width yet.
    if (width <= 0) return;
    const gap = parseFloat(style?.columnGap ?? '') || 0;
    const widths = ordered.map((button) => button.getBoundingClientRect().width);
    if (
      widths.reduce((sum, value) => sum + value, 0) + Math.max(0, ordered.length - 1) * gap <=
      width
    )
      return;
    const overflow = this.overflows.get(placement) ?? this.createOverflow(strip, placement);
    this.overflows.set(placement, overflow);
    strip.appendChild(overflow);
    let occupied = overflow.getBoundingClientRect().width;
    let full = false;
    for (const [index, button] of ordered.entries()) {
      occupied += (widths[index] ?? 0) + gap;
      if (occupied > width) full = true;
      button.hidden = full;
    }
  }

  private createOverflow(strip: HTMLElement, placement: ButtonPlacement): HTMLButtonElement {
    const button = strip.createEl('button', { cls: 'clickable-icon sl-overflow' });
    button.type = 'button';
    button.setAttribute('aria-label', t('More sidebar buttons'));
    button.setAttribute('aria-haspopup', 'menu');
    setIcon(button, 'ellipsis');
    button.addEventListener('click', (event) => {
      const menu = new Menu();
      for (const item of this.items()) {
        if (item.placement !== placement || !this.elements.get(item.key)?.hidden) continue;
        menu.addItem((entry) =>
          entry
            .setTitle(item.label)
            .setIcon(item.icon)
            .setChecked(item.active)
            .onClick(() => {
              this.items()
                .find((current) => current.key === item.key)
                ?.onClick();
            }),
        );
      }
      menu.showAtMouseEvent(event);
    });
    return button;
  }

  private create(item: RowItem, container: HTMLElement): HTMLElement {
    const button = container.createEl('button');
    button.type = 'button';
    button.className = 'clickable-icon sl-button';
    const current = (): RowItem | undefined => this.items().find((i) => i.key === item.key);

    button.addEventListener('click', () => current()?.onClick());
    button.addEventListener('contextmenu', (event) => {
      event.stopImmediatePropagation();
      event.preventDefault();
      current()?.onMenu(event);
    });

    this.paint(button, item);
    container.appendChild(button);
    return button;
  }

  private paint(button: HTMLElement, item: RowItem): void {
    const tooltips = this.tooltips();
    const mark = fingerprint(item, tooltips);
    if (this.painted.get(item.key) === mark) return;
    this.painted.set(item.key, mark);

    button.replaceChildren();
    button.removeAttribute('aria-labelledby');
    setIcon(button, item.icon);
    if (tooltips) {
      setTooltip(button, item.label, { placement: 'bottom' });
      button.setAttribute('aria-label-position', 'bottom');
      button.setAttribute('data-tooltip-delay', '300');
    } else {
      setTooltip(button, '');
      button.removeAttribute('aria-label');
      const label = button.createSpan();
      label.id = `sidebar-button-label-${++labelSequence}`;
      label.hidden = true;
      label.textContent = item.label;
      button.appendChild(label);
      button.setAttribute('aria-labelledby', label.id);
      button.removeAttribute('aria-label-position');
      button.removeAttribute('data-tooltip-delay');
    }
    button.classList.toggle('is-active', item.active);
    button.setAttribute('aria-pressed', String(item.active));
  }

  private removeStrip(placement: ButtonPlacement): void {
    this.resizes.get(placement)?.disconnect();
    this.resizes.delete(placement);
    this.overflows.get(placement)?.remove();
    this.overflows.delete(placement);
    const strip = this.strips.get(placement);
    for (const button of strip?.querySelectorAll('.sl-button') ?? []) button.remove();
    strip?.remove();
    this.strips.delete(placement);
    if (placement === 'header') this.clearHost();
  }

  private removeAll(): void {
    this.removeStrip('header');
    this.removeStrip('panel');
    for (const element of this.elements.values()) element.remove();
    this.elements.clear();
    this.painted.clear();
  }
}
