import 'obsidian';

/** Fail at the missing fixture boundary instead of obscuring the failure in a later DOM operation. */
export function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Expected fixture value to exist');
  return value;
}

/** Obsidian installs its element helpers in every popout window. */
export function installOwnerHelpers(doc: Document): void {
  const prototype = required(doc.defaultView).HTMLElement.prototype;
  for (const name of ['createEl', 'createDiv', 'createSpan']) {
    Object.defineProperty(
      prototype,
      name,
      required(Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)),
    );
  }
}
