/* Runtime stand-in for the `obsidian` module, wired in by vitest.config.ts.
   Types still come from the real package. Extend it as tests need a symbol.

   The settings screen is drawn, not declared, so the stub carries enough of the
   app to draw into: the element helpers Obsidian adds to HTMLElement, and a
   `Setting` with the same three columns the real one has. Every defect the
   screen has produced so far lived here and was invisible to a test. */

/** Tests read English; the locale files are compared by scripts/check-strings.mjs. */
export function getLanguage(): string {
  return 'en';
}

export const moment = (() => undefined) as unknown as never;

/** Runtime identity only; workspace fixtures own their tree and behavior. */
export class WorkspaceSidedock {}

interface ElementOptions {
  cls?: string;
  text?: string;
  type?: string;
  href?: string;
  attr?: Record<string, string>;
}

/* Obsidian adds these to HTMLElement itself, so code written against the app
   calls them without importing anything. */
function createEl(this: HTMLElement, tag: string, options: ElementOptions = {}): HTMLElement {
  const child = this.ownerDocument.createElement(tag);
  if (options.cls !== undefined) child.className = options.cls;
  if (options.text !== undefined) child.textContent = options.text;
  if (options.type !== undefined) child.setAttribute('type', options.type);
  if (options.href !== undefined) child.setAttribute('href', options.href);
  for (const [name, value] of Object.entries(options.attr ?? {})) child.setAttribute(name, value);
  this.appendChild(child);
  return child;
}

const helpers = {
  createEl,

  createDiv(this: HTMLElement, options: ElementOptions = {}): HTMLElement {
    return createEl.call(this, 'div', options);
  },

  createSpan(this: HTMLElement, options: ElementOptions = {}): HTMLElement {
    return createEl.call(this, 'span', options);
  },

  addClass(this: HTMLElement, ...names: string[]): void {
    this.classList.add(...names);
  },

  removeClass(this: HTMLElement, ...names: string[]): void {
    this.classList.remove(...names);
  },

  toggleClass(this: HTMLElement, name: string, on: boolean): void {
    this.classList.toggle(name, on);
  },

  setText(this: HTMLElement, text: string): void {
    this.textContent = text;
  },

  empty(this: HTMLElement): void {
    this.replaceChildren();
  },

  detach(this: HTMLElement): void {
    this.remove();
  },
};

function installHelpers(): void {
  Object.assign(HTMLElement.prototype, helpers);
}

installHelpers();
Object.defineProperty(HTMLElement.prototype, 'win', {
  configurable: true,
  get(this: HTMLElement) {
    return this.ownerDocument.defaultView;
  },
});

export function setIcon(element: HTMLElement, icon: string): void {
  element.setAttribute('data-icon', icon);
}

export function getIconIds(): string[] {
  return ['lucide-layout-panel-right', 'lucide-star'];
}

export function setTooltip(element: HTMLElement, tooltip: string): void {
  element.setAttribute('aria-label', tooltip);
}

export class MenuItem {
  title = '';
  icon = '';
  disabled = false;
  checked = false;
  callback: ((event: MouseEvent) => void) | undefined;

  setTitle(title: string): this {
    this.title = title;
    return this;
  }

  setIcon(icon: string): this {
    this.icon = icon;
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.disabled = disabled;
    return this;
  }

  setChecked(checked: boolean): this {
    this.checked = checked;
    return this;
  }

  setWarning(warning: boolean): this {
    void warning;
    return this;
  }

  onClick(callback: (event: MouseEvent) => void): this {
    this.callback = callback;
    return this;
  }
}

/** Menus expose real buttons so interaction tests use the same labels as users. */
export class Menu {
  readonly items: (MenuItem | null)[] = [];
  private container: HTMLElement | undefined;

  addItem(build: (item: MenuItem) => void): this {
    const item = new MenuItem();
    build(item);
    this.items.push(item);
    return this;
  }

  addSeparator(): this {
    this.items.push(null);
    return this;
  }

  showAtMouseEvent(event: MouseEvent): void {
    const target = event.currentTarget ?? event.target;
    const owner = target instanceof Node ? target.ownerDocument : document;
    this.showAtPosition({ x: event.clientX, y: event.clientY }, owner ?? document);
  }

  showAtPosition(_position: { x: number; y: number }, owner: Document = document): void {
    this.hide();
    owner.querySelectorAll('.test-menu').forEach((menu) => {
      menu.remove();
    });
    const container = owner.createElement('div');
    container.className = 'test-menu';
    container.setAttribute('role', 'menu');
    for (const item of this.items) {
      if (item === null) {
        const separator = owner.createElement('hr');
        separator.setAttribute('role', 'separator');
        container.appendChild(separator);
        continue;
      }
      const button = owner.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.setAttribute('data-icon', item.icon);
      button.textContent = item.title;
      button.disabled = item.disabled;
      button.addEventListener('click', (event) => {
        item.callback?.(event);
        this.hide();
      });
      container.appendChild(button);
    }
    owner.body.appendChild(container);
    this.container = container;
  }

  hide(): void {
    this.container?.remove();
    this.container = undefined;
  }
}

class TextComponent {
  constructor(readonly inputEl: HTMLInputElement) {}

  setPlaceholder(text: string): this {
    this.inputEl.placeholder = text;
    return this;
  }

  setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }

  onChange(listener: (value: string) => void): this {
    this.inputEl.addEventListener('input', () => listener(this.inputEl.value));
    return this;
  }
}

class DropdownComponent {
  constructor(readonly selectEl: HTMLSelectElement) {}

  addOption(value: string, label: string): this {
    const option = this.selectEl.ownerDocument.createElement('option');
    option.value = value;
    option.textContent = label;
    this.selectEl.appendChild(option);
    return this;
  }

  addOptions(options: Record<string, string>): this {
    for (const [value, label] of Object.entries(options)) this.addOption(value, label);
    return this;
  }

  setValue(value: string): this {
    this.selectEl.value = value;
    return this;
  }

  onChange(listener: (value: string) => void): this {
    this.selectEl.addEventListener('change', () => listener(this.selectEl.value));
    return this;
  }
}

/** The three columns the real one has: info holds the name and the description, control holds the rest. */
export class Setting {
  readonly settingEl: HTMLElement;
  readonly infoEl: HTMLElement;
  readonly nameEl: HTMLElement;
  readonly descEl: HTMLElement;
  readonly controlEl: HTMLElement;

  constructor(container: HTMLElement) {
    this.settingEl = container.ownerDocument.createElement('div');
    this.settingEl.className = 'setting-item';
    container.appendChild(this.settingEl);

    this.infoEl = this.settingEl.ownerDocument.createElement('div');
    this.infoEl.className = 'setting-item-info';
    this.settingEl.appendChild(this.infoEl);

    this.nameEl = this.settingEl.ownerDocument.createElement('div');
    this.nameEl.className = 'setting-item-name';
    this.infoEl.appendChild(this.nameEl);

    this.descEl = this.settingEl.ownerDocument.createElement('div');
    this.descEl.className = 'setting-item-description';
    this.infoEl.appendChild(this.descEl);

    this.controlEl = this.settingEl.ownerDocument.createElement('div');
    this.controlEl.className = 'setting-item-control';
    this.settingEl.appendChild(this.controlEl);
  }

  setName(name: string): this {
    this.nameEl.textContent = name;
    return this;
  }

  setDesc(desc: string): this {
    this.descEl.textContent = desc;
    return this;
  }

  setHeading(): this {
    this.settingEl.classList.add('setting-item-heading');
    return this;
  }

  addText(build: (text: TextComponent) => void): this {
    const input = this.controlEl.ownerDocument.createElement('input');
    input.type = 'text';
    this.controlEl.appendChild(input);
    build(new TextComponent(input));
    return this;
  }

  addDropdown(build: (dropdown: DropdownComponent) => void): this {
    const select = this.controlEl.ownerDocument.createElement('select');
    this.controlEl.appendChild(select);
    build(new DropdownComponent(select));
    return this;
  }

  addButton(build: (button: ButtonComponent) => void): this {
    const element = this.controlEl.ownerDocument.createElement('button');
    this.controlEl.appendChild(element);
    build(new ButtonComponent(element));
    return this;
  }
}

/** Native lifecycle boundary: tests exercise real subscribers through registered cleanup. */
export class Component {
  private cleanups: (() => void)[] = [];
  load(): void {}
  register(cleanup: () => void): void {
    this.cleanups.push(cleanup);
  }
  registerDomEvent(target: EventTarget, type: string, callback: EventListener): void {
    target.addEventListener(type, callback);
    this.register(() => target.removeEventListener(type, callback));
  }
  unload(): void {
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
  }
}

export class ButtonComponent {
  constructor(readonly buttonEl: HTMLButtonElement) {}
  setButtonText(text: string): this {
    this.buttonEl.textContent = text;
    return this;
  }
  setDisabled(disabled: boolean): this {
    this.buttonEl.disabled = disabled;
    return this;
  }
  setCta(): this {
    this.buttonEl.classList.add('mod-cta');
    return this;
  }
  onClick(callback: (event: MouseEvent) => void): this {
    this.buttonEl.addEventListener('click', callback);
    return this;
  }
}

export abstract class SettingPage {
  rootEl = document.createElement('div');
  titlebarEl = document.createElement('div');
  containerEl = document.createElement('div');
  title = '';
  abstract display(): void;
  hide(): void {}
}

/* Host shell only: modal content and callbacks execute the real plugin code. */
export class Modal {
  readonly modalEl = document.createElement('div');
  readonly contentEl = this.modalEl.createDiv();
  readonly titleEl = this.modalEl.createDiv();
  constructor(readonly app: unknown) {}
  setTitle(title: string): this {
    this.titleEl.textContent = title;
    return this;
  }
  open(): void {
    document.body.appendChild(this.modalEl);
    this.onOpen();
  }
  close(): void {
    this.onClose();
    this.modalEl.remove();
  }
  onOpen(): void {}
  onClose(): void {}
}

export class FuzzySuggestModal<T> extends Modal {
  setPlaceholder(_text: string): void {
    /* Nothing to place. */
  }
  setInstructions(_instructions: unknown): void {
    /* Nothing to instruct. */
  }
  getItems(): T[] {
    return [];
  }
}

export class Notice {
  containerEl = { addClass: (_name: string) => undefined };
  constructor(readonly message: string) {}
}

export class PluginSettingTab {
  containerEl: HTMLElement;

  constructor(
    readonly app: unknown,
    readonly plugin: unknown,
  ) {
    this.containerEl = document.createElement('div');
  }

  update(): void {
    /* The real one rebuilds the screen; a test asks for the definitions itself. */
  }

  refreshDomState(): void {
    /* Nothing rendered, nothing to refresh. */
  }
}
