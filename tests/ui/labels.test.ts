import type { App } from 'obsidian';
import * as obsidian from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeLayout, layoutPanels, viewLabel } from '../../src/ui/labels';

function app(labels: Record<string, string>): App {
  return {
    workspace: {
      getLeavesOfType: (type: string) =>
        type in labels ? [{ view: { getDisplayText: () => labels[type] } }] : [],
    },
  } as unknown as App;
}
describe('layout labels', () => {
  it('uses the current view display text and prettifies missing or blank view labels', () => {
    const host = app({ outline: ' Outline ', 'outgoing-link': '  ' });
    expect(viewLabel(host, 'outline')).toBe('Outline');
    expect(viewLabel(host, 'outgoing-link')).toBe('Outgoing link');
    expect(viewLabel(host, 'file_properties')).toBe('File properties');
  });
  it('preserves panel order and optional heights and describes empty layouts explicitly', () => {
    const host = app({ outline: 'Outline', backlink: 'Backlinks' });
    const shape = {
      home: 'outline',
      floors: [{ view: 'backlink', dimension: 33.7 }, { view: 'search' }],
    };
    expect(layoutPanels(host, shape)).toEqual([
      { label: 'Outline', height: '' },
      { label: 'Backlinks', height: '34%' },
      { label: 'Search', height: '' },
    ]);
    expect(describeLayout(host, shape)).toBe('Outline · Backlinks · Search');
    expect(describeLayout(host, { home: null, floors: [] })).toBe('Empty');
  });
});

describe('sidebar-aware labels and previews', () => {
  it('resolves the selected sidebar instead of taking a same-type panel from the other side', () => {
    const left = {};
    const right = {};
    const host = {
      workspace: {
        leftSplit: left,
        rightSplit: right,
        getLeavesOfType: () => [
          { getRoot: () => left, view: { getDisplayText: () => 'Left panel' } },
          { getRoot: () => right, view: { getDisplayText: () => 'Right panel' } },
        ],
      },
    } as unknown as App;
    expect(viewLabel(host, 'outline', 'left')).toBe('Left panel');
    expect(viewLabel(host, 'outline', 'right')).toBe('Right panel');
    expect(viewLabel(host, 'markdown', 'right')).toBe('Note');
    expect(
      layoutPanels(host, { home: 'outline', homeDimension: 45.5, floors: [] }, 'right'),
    ).toEqual([{ label: 'Right panel', height: '46%' }]);
    expect(viewLabel(app({ outline: 'Other pane' }), 'outline', 'right')).toBe('Outline');
  });
});

afterEach(() => vi.restoreAllMocks());
describe('Russian panel labels', () => {
  it('translates known missing panels while preserving names from Obsidian and unknown plugins', () => {
    vi.spyOn(obsidian, 'getLanguage').mockReturnValue('ru');
    const host = app({ outline: 'Custom Outline', markdown: 'Secret note' });
    expect(viewLabel(host, 'outline')).toBe('Custom Outline');
    expect(viewLabel(host, 'markdown')).toBe('Заметка');
    expect(viewLabel(host, 'file-explorer')).toBe('Файлы');
    expect(viewLabel(host, 'backlink')).toBe('Обратные ссылки');
    expect(viewLabel(host, 'outgoing-link')).toBe('Исходящие ссылки');
    expect(viewLabel(host, 'custom-widget')).toBe('Custom widget');
    expect(describeLayout(host, { home: null, floors: [] })).toBe('Пусто');
  });
});
