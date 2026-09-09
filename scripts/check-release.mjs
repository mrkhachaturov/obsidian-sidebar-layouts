#!/usr/bin/env node
/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 *
 * Checks that everything carrying the version agrees: the manifest, the package
 * file, the compatibility map and the changelog. With --notes it prints that
 * version's changelog section, which is the body of the GitHub release; with
 * --version, the number the release will carry.
 *
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SEMVER = /^\d+\.\d+\.\d+$/;

async function json(name) {
  return JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The lines under `## [version] - date`, up to the next section.
 *
 * Compared as text rather than through a regular expression built from the
 * version: escaping a value into a pattern is a sanitizer, and a sanitizer that
 * misses one metacharacter is a bug this file does not need to have.
 */
function section(changelog, version) {
  const prefix = `## [${version}] - `;
  const isHeading = (line) => line.startsWith(prefix) && DATE.test(line.slice(prefix.length));
  const lines = changelog.split('\n');
  const start = lines.findIndex(isHeading);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  const body = (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
  return body.length === 0 ? null : body;
}

async function main() {
  const args = process.argv.slice(2);

  const manifest = await json('manifest.json');
  const pkg = await json('package.json');
  const versions = await json('versions.json');
  const changelog = await fs.readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
  const version = manifest.version;

  const problems = [];
  if (!SEMVER.test(version)) problems.push(`manifest version "${version}" is not MAJOR.MINOR.PATCH`);
  if (pkg.version !== version)
    problems.push(`package.json is on ${pkg.version}, the manifest on ${version}`);
  if (versions[version] === undefined) problems.push(`versions.json has no entry for ${version}`);
  else if (versions[version] !== manifest.minAppVersion)
    problems.push(
      `versions.json maps ${version} to Obsidian ${versions[version]}, ` +
        `the manifest requires ${manifest.minAppVersion}`,
    );

  const body = section(changelog, version);
  if (body === null)
    problems.push(`CHANGELOG.md has no "## [${version}] - <date>" section with anything under it`);

  if (problems.length > 0) {
    for (const problem of problems) console.error(`Release: ${problem}`);
    process.exit(1);
  }

  /* The tag is written from this, never typed, so nothing can disagree with it. */
  if (args.includes('--version')) console.log(`version=${version}`);
  else if (args.includes('--notes')) console.log(body);
  else console.log(`Release: ${version} agrees across manifest, package, versions and changelog.`);
}

await main();
