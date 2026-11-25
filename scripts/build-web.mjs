// Copies the web app shell into dist/, the folder Capacitor bundles into the native app (capacitor.config.json webDir).
// The PWA keeps living at the repo root for GitHub Pages; this is only a copy step, nothing is transformed.
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEB_FILES = ['index.html', 'manifest.webmanifest', 'sw.js'];
export const WEB_DIRS = ['css', 'js', 'vendor', 'icons'];

export function buildWeb(root, outDir) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const f of WEB_FILES) cpSync(join(root, f), join(outDir, f));
  for (const d of WEB_DIRS) cpSync(join(root, d), join(outDir, d), { recursive: true });
  return outDir;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const out = buildWeb(root, join(root, 'dist'));
  if (!existsSync(join(out, 'index.html'))) { console.error('build-web: index.html missing from dist'); process.exit(1); }
  console.log(`build-web: copied ${WEB_FILES.length} files and ${WEB_DIRS.length} folders to ${out}`);
}
