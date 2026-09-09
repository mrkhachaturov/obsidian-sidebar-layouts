import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const patch = 'patches/dnd-kit-dom-0.5.0.patch';
const dependency = JSON.parse(readFileSync(new URL('../node_modules/@dnd-kit/dom/package.json', import.meta.url)));

if (dependency.version !== '0.5.0') {
  throw new Error('Review the dnd-kit popout patch before changing @dnd-kit/dom.');
}

function apply(...args) {
  execFileSync('git', ['apply', ...args, patch], { cwd, stdio: 'pipe' });
}

// npm install may run again without replacing the already patched package.
try {
  apply('--reverse', '--check');
} catch {
  apply('--check');
  apply();
}
