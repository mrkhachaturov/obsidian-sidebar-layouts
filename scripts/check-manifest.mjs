#!/usr/bin/env node
/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 *
 * The community directory's manifest rules, run before a release rather than
 * reported on the listing after one.
 *
 * Two sources, both checked here: `validatePluginManifest` in
 * obsidianmd/obsidian-workflows (required fields, semver, the name words, the
 * URLs), and the written submission requirements, which the action does not
 * enforce (the description's shape, and no "Obsidian" in it).
 *
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SEMVER = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
/* Their DISALLOWED_NAME_WORDS. A warning in their action; here it is a failure,
 * because a rename after publication resets every install. */
const FORBIDDEN_IN_NAME = ['obsidian', 'plugin'];
const FORBIDDEN_IN_DESCRIPTION = ['obsidian'];
const OPENINGS = ['this is', 'this plugin', 'a plugin', 'the plugin'];

async function json(name) {
  return JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
}

async function nonEmptyFile(name) {
  try {
    return (await fs.readFile(path.join(root, name), 'utf8')).trim().length > 0;
  } catch {
    return false;
  }
}

function url(value, field, problems) {
  if (value === undefined) return;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
      problems.push(`${field} is not an HTTP or HTTPS URL: "${value}"`);
  } catch {
    problems.push(`${field} is not a valid URL: "${value}"`);
  }
}

async function main() {
  const manifest = await json('manifest.json');
  const versions = await json('versions.json');
  const problems = [];

  for (const field of ['id', 'name', 'version', 'description', 'minAppVersion', 'author']) {
    const value = manifest[field];
    if (typeof value !== 'string' || value.trim().length === 0)
      problems.push(`manifest is missing ${field}`);
  }

  for (const field of ['version', 'minAppVersion']) {
    const value = manifest[field];
    if (typeof value === 'string' && !SEMVER.test(value))
      problems.push(`${field} "${value}" is not MAJOR.MINOR.PATCH`);
  }

  const id = manifest.id ?? '';
  if (!/^[a-z0-9-]+$/.test(id)) problems.push(`id "${id}" is not lowercase letters, digits and -`);
  if (id.includes('obsidian')) problems.push(`id "${id}" contains "obsidian"`);
  if (id.endsWith('-plugin')) problems.push(`id "${id}" ends with "plugin"`);

  const name = manifest.name ?? '';
  for (const word of FORBIDDEN_IN_NAME)
    if (name.toLowerCase().includes(word)) problems.push(`name "${name}" contains "${word}"`);

  const description = (manifest.description ?? '').trim();
  if (description.length < 10) problems.push(`description is ${description.length} characters`);
  if (description.length > 250) problems.push(`description is ${description.length} characters`);
  if (!/[.?!)]$/.test(description)) problems.push('description does not end with . ? ! or )');
  for (const word of FORBIDDEN_IN_DESCRIPTION)
    if (description.toLowerCase().includes(word))
      problems.push(`description contains "${word}"`);
  for (const opening of OPENINGS)
    if (description.toLowerCase().startsWith(opening))
      problems.push(`description opens with "${opening}"`);
  /* Emoji and other symbols: the requirement says plain text. */
  if (/\p{Extended_Pictographic}/u.test(description)) problems.push('description contains emoji');

  if (typeof manifest.isDesktopOnly !== 'boolean') problems.push('isDesktopOnly is not a boolean');
  url(manifest.authorUrl, 'authorUrl', problems);
  url(manifest.fundingUrl, 'fundingUrl', problems);

  for (const [version, minimum] of Object.entries(versions)) {
    if (!SEMVER.test(version)) problems.push(`versions.json key "${version}" is not semver`);
    if (typeof minimum !== 'string' || !SEMVER.test(minimum))
      problems.push(`versions.json maps ${version} to "${minimum}", which is not semver`);
  }

  for (const file of ['README.md', 'LICENSE'])
    if (!(await nonEmptyFile(file))) problems.push(`${file} is missing or empty`);

  if (problems.length > 0) {
    for (const problem of problems) console.error(`Manifest: ${problem}`);
    process.exit(1);
  }
  console.log(`Manifest: ${manifest.id} ${manifest.version} satisfies the directory's rules.`);
}

await main();
