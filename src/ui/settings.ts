/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import {
  type Plugin,
  PluginSettingTab,
  type SettingDefinitionItem,
  type SettingDefinitionPage,
  type SettingGroupItem,
  setIcon,
} from 'obsidian';
import type { SettingsHost } from '../controller';
import { t } from '../i18n';
import { reportError } from '../logging';
import {
  arrangementOf,
  type Button,
  isLayout,
  isModified,
  type LayoutButton,
  type SidebarSide,
} from '../model';
import {
  buttonSummary,
  describeLayout,
  renderButtonPreview,
  sideLabel,
  summarizeButtons,
} from './labels';
import { ManageButtonsModal } from './manageModal';
import { IconSuggest } from './modals';

/* Described rather than drawn: Obsidian renders these itself, and gives the
 * list its drag handles, its delete affordance and its `+` button for free. */

type Field =
  | 'name'
  | 'visible'
  | 'registerCommand'
  | 'fullWidthNotes'
  | 'placement'
  | 'showWhenCollapsed';

function keyOf(id: string, field: Field): string {
  return `${id}::${field}`;
}

function parseKey(key: string): { id: string; field: Field } | null {
  const at = key.lastIndexOf('::');
  if (at < 0) return null;
  const field = key.slice(at + 2);
  if (
    field !== 'name' &&
    field !== 'visible' &&
    field !== 'registerCommand' &&
    field !== 'fullWidthNotes' &&
    field !== 'placement' &&
    field !== 'showWhenCollapsed'
  )
    return null;
  return { id: key.slice(0, at), field };
}

export class SidebarLayoutsSettingTab extends PluginSettingTab {
  private readonly hosts: Record<SidebarSide, SettingsHost>;

  constructor(hosts: Record<SidebarSide, SettingsHost>, plugin: Plugin) {
    super(hosts.right.app, plugin);
    this.hosts = hosts;
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [this.sidePage('left'), this.sidePage('right'), this.appearance()];
  }

  override getControlValue(key: string): unknown {
    if (key === 'hideManagedTabs' || key === 'showTooltips') return this.hosts.right.data[key];

    const parsed = parseKey(key);
    if (parsed === null) return undefined;
    const button = this.hostFor(parsed.id)?.data.buttons.find((entry) => entry.id === parsed.id);
    if (button === undefined) return undefined;
    if (parsed.field === 'name') return button.name;
    if (parsed.field === 'visible') return button.visible;
    if (parsed.field === 'placement') return button.placement;
    if (parsed.field === 'showWhenCollapsed') return button.showWhenCollapsed;
    if (!isLayout(button)) return undefined;
    return button[parsed.field];
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === 'hideManagedTabs' || key === 'showTooltips') {
      if (typeof value === 'boolean') await this.hosts.right.setFlag(key, value);
      return;
    }

    const parsed = parseKey(key);
    if (parsed === null) return;
    const { id, field } = parsed;
    const host = this.hostFor(id);
    if (host === undefined) return;

    /* No re-render here. A text control reports every keystroke, and rebuilding
     * the tree recreates the page being typed on: the field loses focus and the
     * user is thrown out of it, one letter at a time. The stored name is enough;
     * the row's label refreshes on the next natural render. */
    if (field === 'name') {
      if (typeof value !== 'string') return;
      const name = value.trim();
      if (name.length > 0) await host.edit(id, (entry) => ({ ...entry, name }));
      return;
    }
    if (field === 'placement') {
      if (value === 'header' || value === 'panel') {
        await host.edit(id, (entry) => ({ ...entry, placement: value }));
        this.update();
      }
      return;
    }
    if (typeof value !== 'boolean') return;
    await host.edit(id, (entry) =>
      field === 'visible' || field === 'showWhenCollapsed' || isLayout(entry)
        ? { ...entry, [field]: value }
        : entry,
    );
  }

  private hostFor(id: string): SettingsHost | undefined {
    return [this.hosts.left, this.hosts.right].find((host) =>
      host.data.buttons.some((button) => button.id === id),
    );
  }

  private sidePage(side: SidebarSide): SettingDefinitionPage {
    const host = this.hosts[side];
    return {
      type: 'page',
      name: sideLabel(side),
      get desc() {
        return summarizeButtons(host.data.buttons);
      },
      items: [
        this.manageRow(host),
        {
          name: t('Button preview'),
          desc: t(
            'Visible buttons, in sidebar order. Hidden buttons appear only in the list below.',
          ),
          render: (setting) => renderButtonPreview(setting.controlEl, side, host.data.buttons),
        },
        this.buttons(host),
      ],
    };
  }

  /* --------------------------------------------------------------- lists */

  private buttons(host: SettingsHost): SettingDefinitionItem {
    let displayed = [...host.data.buttons];
    const page = (button: Button): SettingDefinitionPage => this.page(host, button);
    return {
      type: 'list',
      emptyState: t(
        host.side === 'left'
          ? 'No buttons in the left sidebar yet. Save its current arrangement as a layout, or add a command shortcut.'
          : 'No buttons in the right sidebar yet. Save its current arrangement as a layout, or add a command shortcut.',
      ),
      onReorder: (from, to) => {
        const source = displayed[from];
        const target = displayed[to];
        if (source === undefined || target === undefined) return;
        const current = host.data.buttons;
        const sourceIndex = current.findIndex((button) => button.id === source.id);
        const targetIndex = current.findIndex((button) => button.id === target.id);
        if (sourceIndex < 0 || targetIndex < 0) return;
        this.refreshAfter(host.moveTo(sourceIndex, targetIndex));
      },
      onDelete: (index) => {
        const button = displayed[index];
        if (button !== undefined) this.refreshAfter(host.remove(button.id));
      },
      get items() {
        displayed = [...host.data.buttons];
        return displayed.map(page);
      },
    };
  }

  private refreshAfter(work: Promise<unknown>): void {
    void work
      .then(() => this.update())
      .catch((error: unknown) => reportError(error, t('Updating buttons')));
  }

  /* A labelled button, the way Notebook Navigator offers "Edit profiles": an
   * icon alone does not say that this is where buttons are created. */
  private manageRow(host: SettingsHost): SettingDefinitionItem {
    return {
      type: 'group',
      heading: sideLabel(host.side),
      items: [
        {
          name: t('Buttons'),
          desc: t('Save layouts and add shortcuts for this sidebar.'),
          render: (setting) => {
            setting.settingEl.addClass('sl-settings-actions');
            setting.addButton((button) =>
              button
                .setButtonText(t('Save current layout'))
                .onClick(() => host.createLayout(() => this.update())),
            );
            setting.addButton((button) =>
              button
                .setButtonText(t('Add command'))
                .onClick(() => host.addCommand(() => this.update())),
            );
            setting.addButton((button) =>
              button.setButtonText(t('Edit buttons')).onClick(() => this.openManage(host)),
            );
          },
        },
      ],
    };
  }

  /* Every action here changes what the tab behind the modal is showing, so each
   * one redraws it. Without that the list and the page title keep the old name
   * until the tab is left and reopened. */
  private openManage(host: SettingsHost): void {
    const redraw = <T>(work: Promise<T>): Promise<void> => work.then(() => this.update());

    new ManageButtonsModal(host.app, {
      side: host.side,
      list: () => host.data.buttons,
      rename: (id, name) => redraw(host.edit(id, (entry) => ({ ...entry, name }))),
      move: (from, to) => redraw(host.moveTo(from, to)),
      remove: (id) => redraw(host.remove(id)),
      addLayout: (onAdded) =>
        host.createLayout(() => {
          this.update();
          onAdded();
        }),
      addCommand: (onAdded) =>
        host.addCommand(() => {
          this.update();
          onAdded();
        }),
    }).open();
  }

  private page(host: SettingsHost, button: Button): SettingDefinitionPage {
    const rows = (current: Button): SettingGroupItem[] => [
      { name: t('Name'), control: { type: 'text', key: keyOf(current.id, 'name') } },
      this.iconRow(host, current),
      {
        name: t('Button position'),
        desc: t('Buttons below panel tabs hide with the sidebar.'),
        control: {
          type: 'dropdown',
          key: keyOf(current.id, 'placement'),
          options: { header: t('In the window header'), panel: t('Below panel tabs') },
        },
      },
      ...(current.placement === 'header'
        ? [
            {
              name: t('Show when sidebar is closed'),
              desc: t('Keep this button in the window header when its sidebar is closed.'),
              control: { type: 'toggle' as const, key: keyOf(current.id, 'showWhenCollapsed') },
            },
          ]
        : []),
      {
        name: t('Show button'),
        desc: t('When off, its command remains available if enabled.'),
        control: { type: 'toggle', key: keyOf(current.id, 'visible') },
      },
      ...(isLayout(current) ? this.layoutItems(host, current) : commandItems(current)),
    ];
    const current = (): Button | undefined =>
      host.data.buttons.find((entry) => entry.id === button.id);
    return {
      type: 'page',
      get name() {
        return current()?.name ?? t('Button removed');
      },
      get desc() {
        const entry = current();
        return entry === undefined
          ? ''
          : isLayout(entry)
            ? `${buttonSummary(entry)} · ${describeLayout(host.app, arrangementOf(entry), host.side)}`
            : `${buttonSummary(entry)} · ${commandIdOf(entry)}`;
      },
      status: () => {
        const entry = current();
        return entry !== undefined && isLayout(entry) && isModified(entry) ? 'warning' : null;
      },
      get items() {
        const entry = current();
        return entry === undefined ? [] : rows(entry);
      },
    };
  }

  /* `render`, not `action`: action is the click handler and never draws
   * anything, so the icon only appeared after the first click - which was also
   * the click that opened the picker. */
  private iconRow(host: SettingsHost, button: Button): SettingGroupItem {
    return {
      name: t('Icon'),
      render: (setting) => {
        const current = host.data.buttons.find((entry) => entry.id === button.id);
        if (current === undefined) return;
        setIcon(setting.controlEl.createDiv({ cls: 'sl-icon-preview-large' }), current.icon);
        setting.addButton((control) =>
          control.setButtonText(t('Change')).onClick(() => {
            new IconSuggest(this.app, (icon) => {
              this.refreshAfter(host.edit(button.id, (entry) => ({ ...entry, icon })));
            }).open();
          }),
        );
      },
    };
  }

  private layoutItems(host: SettingsHost, layout: LayoutButton): SettingGroupItem[] {
    const changed: SettingGroupItem[] = isModified(layout)
      ? [
          { name: t('Saved layout'), desc: describeLayout(host.app, layout.saved, host.side) },
          {
            name: t('Save changes'),
            desc: t('Replace the saved layout with its current changes.'),
            action: () => {
              this.refreshAfter(host.promote(layout.id));
            },
          },
          {
            name: t('Restore saved layout'),
            desc:
              host.data.governing[host.side] === layout.id
                ? t('Discard changes and return this sidebar to the saved arrangement.')
                : t('Discard the changes remembered for this layout.'),
            action: () => {
              this.refreshAfter(host.reset(layout.id));
            },
          },
        ]
      : [];

    return [
      {
        name: t('Apply layout'),
        desc: t(
          host.side === 'left'
            ? 'Switch the left sidebar to this layout, including changes remembered between switches.'
            : 'Switch the right sidebar to this layout, including changes remembered between switches.',
        ),
        action: () => this.refreshAfter(host.apply(layout.id)),
      },
      { name: t('Panels'), desc: describeLayout(host.app, arrangementOf(layout), host.side) },
      ...changed,
      {
        name: t('Add to the command palette'),
        desc: t(
          host.side === 'left'
            ? 'Off removes its command. It stays reachable from its button and from "Switch left sidebar layout".'
            : 'Off removes its command. It stays reachable from its button and from "Switch right sidebar layout".',
        ),
        control: { type: 'toggle', key: keyOf(layout.id, 'registerCommand') },
      },
      {
        name: t('Full width for notes'),
        desc: t('Hide the panels below while a note is open at the top of the sidebar.'),
        control: { type: 'toggle', key: keyOf(layout.id, 'fullWidthNotes') },
      },
    ];
  }

  /* ---------------------------------------------------------- appearance */

  private appearance(): SettingDefinitionItem {
    return {
      type: 'group',
      heading: t('Appearance'),
      items: [
        {
          name: t('Hide managed tabs'),
          desc: t(
            'Hide the tabs of every panel your layouts control - the buttons replace them. Panels no layout mentions, such as a note you dragged in, keep their tab.',
          ),
          control: { type: 'toggle', key: 'hideManagedTabs' },
        },
        {
          name: t('Show tooltips'),
          desc: t('Show the button name when hovering it.'),
          control: { type: 'toggle', key: 'showTooltips' },
        },
      ],
    };
  }
}

function commandIdOf(button: Button): string {
  return isLayout(button) ? '' : button.commandId;
}

function commandItems(button: Button): SettingGroupItem[] {
  return [{ name: t('Command'), desc: commandIdOf(button) }];
}
