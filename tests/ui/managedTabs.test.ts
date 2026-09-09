import { afterEach, describe, expect, it } from 'vitest';
import { applyManagedTabStyle, removeManagedTabStyle } from '../../src/ui/managedTabs';
import { installOwnerHelpers, required } from './required';

afterEach(() => {
  removeManagedTabStyle(document);
  document.body.replaceChildren();
});
function header(doc: Document, type: string, right = true): HTMLElement {
  installOwnerHelpers(doc);
  const root = doc.body.createDiv({
    cls: `workspace-split ${right ? 'mod-right-split' : 'mod-left-split'}`,
  });
  return root.createDiv({ cls: 'workspace-tab-header', attr: { 'data-type': type } });
}
describe('managed tabs', () => {
  it('updates headers only in the owning right sidebar and restores them when disabled or empty', () => {
    const frame = document.body.createEl('iframe');
    const doc = required(frame.contentDocument);
    const outline = header(doc, 'outline');
    const backlink = header(doc, 'backlink');
    const unrelated = header(document, 'outline');
    const left = header(doc, 'outline', false);
    applyManagedTabStyle(doc, new Set(['outline']), true);
    expect(outline.classList.contains('sl-managed-tab-hidden')).toBe(true);
    expect(unrelated.classList.contains('sl-managed-tab-hidden')).toBe(false);
    expect(left.classList.contains('sl-managed-tab-hidden')).toBe(false);
    applyManagedTabStyle(doc, new Set(['backlink']), true);
    expect(outline.classList.contains('sl-managed-tab-hidden')).toBe(false);
    expect(backlink.classList.contains('sl-managed-tab-hidden')).toBe(true);
    applyManagedTabStyle(doc, new Set(['backlink']), false);
    expect(backlink.classList.contains('sl-managed-tab-hidden')).toBe(false);
    applyManagedTabStyle(doc, new Set(['outline']), true);
    applyManagedTabStyle(doc, new Set(), true);
    expect(outline.classList.contains('sl-managed-tab-hidden')).toBe(false);
    expect(doc.querySelector('style')).toBeNull();
    removeManagedTabStyle(doc);
  });
  it('matches hostile view names literally and tracks rebuilt headers until cleanup', async () => {
    const type = 'x"\n] { color: red; } /*\\';
    const target = header(document, type);
    const ordinary = header(document, 'outline');
    applyManagedTabStyle(document, new Set([type]), true);
    expect(target.classList.contains('sl-managed-tab-hidden')).toBe(true);
    expect(ordinary.classList.contains('sl-managed-tab-hidden')).toBe(false);
    const replacement = header(document, type);
    await Promise.resolve();
    expect(replacement.classList.contains('sl-managed-tab-hidden')).toBe(true);
    replacement.setAttribute('data-type', 'search');
    await Promise.resolve();
    expect(replacement.classList.contains('sl-managed-tab-hidden')).toBe(false);
    removeManagedTabStyle(document);
    expect(target.classList.contains('sl-managed-tab-hidden')).toBe(false);
    const later = header(document, type);
    await Promise.resolve();
    expect(later.classList.contains('sl-managed-tab-hidden')).toBe(false);
  });
});

it('keeps both side configurations in one document and restores only the selected side', async () => {
  const left = header(document, 'outline', false);
  const right = header(document, 'outline');
  applyManagedTabStyle(document, new Set(['outline']), true, 'left');
  applyManagedTabStyle(document, new Set(['outline']), true, 'right');
  expect(left.classList.contains('sl-managed-tab-hidden')).toBe(true);
  expect(right.classList.contains('sl-managed-tab-hidden')).toBe(true);
  applyManagedTabStyle(document, new Set(), true, 'left');
  expect(left.classList.contains('sl-managed-tab-hidden')).toBe(false);
  expect(right.classList.contains('sl-managed-tab-hidden')).toBe(true);
  const rebuilt = header(document, 'outline');
  await Promise.resolve();
  expect(rebuilt.classList.contains('sl-managed-tab-hidden')).toBe(true);
  removeManagedTabStyle(document);
  expect(rebuilt.classList.contains('sl-managed-tab-hidden')).toBe(false);
  expect(right.classList.contains('sl-managed-tab-hidden')).toBe(false);
});
