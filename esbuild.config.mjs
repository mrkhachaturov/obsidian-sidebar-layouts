import process from 'node:process';
import builtins from 'builtin-modules';
import esbuild from 'esbuild';

const production = process.argv[2] === 'production';

/* Obsidian loads main.js from the plugin folder, so the bundle lands in the
   repo root next to manifest.json - that trio is what gets installed. */
const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', ...builtins],
  format: 'cjs',
  target: 'es2020',
  logLevel: 'info',
  sourcemap: production ? false : 'inline',
  treeShaking: true,
  minify: production,
  outfile: 'main.js',
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
