#!/usr/bin/env node
/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 *
 * Checks that the stylesheet and the code agree about class names, in both
 * directions: a class the code writes and nobody styles, and a rule left behind
 * by a class nobody writes any more.
 *
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* `--sl-depth` is a custom property, not a class: the dash before it tells them apart. */
const IN_CODE = /(?<![-\w])sl-[a-z0-9-]+/g;
const IN_SHEET = /\.(sl-[a-z0-9-]+)/g;

async function sources(dir, found = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await sources(full, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

async function main() {
  const used = new Set();
  for (const file of await sources(path.join(root, 'src'))) {
    const source = await fs.readFile(file, 'utf8');
    for (const match of source.matchAll(IN_CODE)) used.add(match[0]);
  }

  const declared = new Set();
  const sheet = await fs.readFile(path.join(root, 'styles.css'), 'utf8');
  for (const match of sheet.matchAll(IN_SHEET)) declared.add(match[1]);

  /* An empty side means the reading broke, not that the two agree. */
  if (used.size === 0 || declared.size === 0) {
    console.error('Read no classes from one side; the check itself is broken.');
    process.exit(1);
  }

  const unstyled = [...used].filter((name) => !declared.has(name)).sort();
  const unused = [...declared].filter((name) => !used.has(name)).sort();

  if (unstyled.length > 0)
    console.error(`\nWritten in src and styled nowhere (${unstyled.length}):`);
  for (const name of unstyled) console.error(`  .${name}`);

  if (unused.length > 0)
    console.error(`\nStyled in styles.css and written nowhere (${unused.length}):`);
  for (const name of unused) console.error(`  .${name}`);

  if (unstyled.length + unused.length > 0) process.exit(1);
  console.log(`Styles: ${used.size} classes, all styled, none left behind.`);
}

await main();
