/// <reference types="node" />
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sidebar-maintenance-'));
  temporary.push(root);
  await mkdir(path.join(root, 'scripts'));
  return root;
}

async function checkStyles(source: string, css: string): Promise<boolean> {
  const root = await fixture();
  await copyFile('scripts/check-styles.mjs', path.join(root, 'scripts/check-styles.mjs'));
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'src/editor.tsx'), source);
  await writeFile(path.join(root, 'styles.css'), css);
  return run(process.execPath, ['scripts/check-styles.mjs'], { cwd: root }).then(
    () => true,
    () => false,
  );
}

describe('stylesheet maintenance contract', () => {
  it('reads TSX classes without treating custom properties as class names', async () => {
    expect(
      await checkStyles('<div class="sl-card"/>; const height = "--sl-height";', '.sl-card {}'),
    ).toBe(true);
  });
  it('refuses missing styling, stale selectors and empty measurement', async () => {
    expect(await checkStyles('<div class="sl-card sl-handle"/>', '.sl-card {}')).toBe(false);
    expect(await checkStyles('<div class="sl-card"/>', '.sl-card {} .sl-obsolete {}')).toBe(false);
    expect(await checkStyles('', '')).toBe(false);
  });
});

describe('dnd patch installation contract', () => {
  it('accepts a second installation and refuses a different dependency version without changing it', async () => {
    const root = await fixture();
    await copyFile(
      'scripts/patch-dependencies.mjs',
      path.join(root, 'scripts/patch-dependencies.mjs'),
    );
    await mkdir(path.join(root, 'patches'));
    await copyFile(
      'patches/dnd-kit-dom-0.5.0.patch',
      path.join(root, 'patches/dnd-kit-dom-0.5.0.patch'),
    );
    const dependency = path.join(root, 'node_modules/@dnd-kit/dom');
    await mkdir(dependency, { recursive: true });
    const patch = await readFile('patches/dnd-kit-dom-0.5.0.patch', 'utf8');
    const files = [...patch.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((match) => match[1]);
    expect(files.length).toBe(2);
    for (const file of files) {
      if (file === undefined) throw new Error('Missing patch target');
      await copyFile(file, path.join(root, file));
    }
    const metadata = path.join(dependency, 'package.json');
    await writeFile(metadata, JSON.stringify({ version: '0.5.0' }));
    const expected = await Promise.all(
      files.map((file) => readFile(path.join(root, file ?? ''), 'utf8')),
    );
    await run('git', ['apply', '--reverse', 'patches/dnd-kit-dom-0.5.0.patch'], { cwd: root });
    await run(process.execPath, ['scripts/patch-dependencies.mjs'], { cwd: root });
    await run(process.execPath, ['scripts/patch-dependencies.mjs'], { cwd: root });
    const before = await Promise.all(
      files.map((file) => readFile(path.join(root, file ?? ''), 'utf8')),
    );
    expect(before).toEqual(expected);
    await writeFile(metadata, JSON.stringify({ version: '0.6.0' }));
    await expect(
      run(process.execPath, ['scripts/patch-dependencies.mjs'], { cwd: root }),
    ).rejects.toThrow();
    const after = await Promise.all(
      files.map((file) => readFile(path.join(root, file ?? ''), 'utf8')),
    );
    expect(after).toEqual(before);
  });
});

interface ReleaseFiles {
  readonly manifest?: Record<string, unknown>;
  readonly pkg?: Record<string, unknown>;
  readonly versions?: Record<string, string>;
  readonly changelog?: string;
}

const RELEASED = '## [1.2.3] - 2026-09-09\n\n### Added\n\n- A layout for the left sidebar.\n';

async function checkRelease(files: ReleaseFiles, args: string[] = []): Promise<string | null> {
  const root = await fixture();
  await copyFile('scripts/check-release.mjs', path.join(root, 'scripts/check-release.mjs'));
  const write = async (name: string, value: unknown): Promise<void> => {
    await writeFile(
      path.join(root, name),
      typeof value === 'string' ? value : JSON.stringify(value),
    );
  };
  await write('manifest.json', files.manifest ?? { version: '1.2.3', minAppVersion: '1.13.0' });
  await write('package.json', files.pkg ?? { version: '1.2.3' });
  await write('versions.json', files.versions ?? { '1.2.3': '1.13.0' });
  await write('CHANGELOG.md', files.changelog ?? RELEASED);
  return run(process.execPath, ['scripts/check-release.mjs', ...args], { cwd: root }).then(
    ({ stdout }) => stdout,
    () => null,
  );
}

describe('release contract', () => {
  it('accepts one version carried by the manifest, package, versions and changelog', async () => {
    expect(await checkRelease({})).toContain('1.2.3');
  });

  it('reports the version the release will carry, which is what writes the tag', async () => {
    expect((await checkRelease({}, ['--version']))?.trim()).toBe('version=1.2.3');
  });

  it('prints the changelog section of the released version as the release body', async () => {
    const notes = await checkRelease(
      { changelog: `## Unreleased\n\n${RELEASED}\n## [1.2.2] - 2026-09-01\n\n- Older.\n` },
      ['--notes'],
    );
    expect(notes?.trim()).toBe('### Added\n\n- A layout for the left sidebar.');
  });

  it('refuses a version that is not MAJOR.MINOR.PATCH', async () => {
    expect(
      await checkRelease({ manifest: { version: 'v1.2.3', minAppVersion: '1.13.0' } }),
    ).toBeNull();
  });

  it('refuses a compatibility entry that disagrees with the manifest', async () => {
    expect(await checkRelease({ versions: { '1.2.3': '1.12.0' } })).toBeNull();
    expect(await checkRelease({ versions: { '1.2.2': '1.13.0' } })).toBeNull();
  });

  it('refuses a version the package file or the changelog has not caught up with', async () => {
    expect(await checkRelease({ pkg: { version: '1.2.2' } })).toBeNull();
    expect(await checkRelease({ changelog: '## Unreleased\n' })).toBeNull();
    expect(await checkRelease({ changelog: '## [1.2.3] - 2026-09-09\n\n## [1.2.2]\n' })).toBeNull();
  });
});
