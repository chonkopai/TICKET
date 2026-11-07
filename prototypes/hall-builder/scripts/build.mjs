import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
let esbuild;
try { esbuild = createRequire(new URL('../package.json', import.meta.url))('esbuild'); }
catch { esbuild = createRequire(realpathSync(new URL('../../../apps/api/node_modules/tsx/package.json', import.meta.url)))('esbuild'); }
export async function build() {
  const result = await esbuild.build({ entryPoints: [path.join(root, 'src/app.jsx')], bundle: true, minify: true, write: false, format: 'iife', jsx: 'automatic', nodePaths: [path.resolve(root, '../../apps/web/node_modules')], define: { 'process.env.NODE_ENV': '"production"' }, outfile: 'app.js' });
  const js = result.outputFiles.find(f => f.path.endsWith('.js')).text;
  const css = (await readFile(path.join(root, 'src/site-theme.css'), 'utf8')) + '\n' + (await readFile(path.join(root, 'src/styles.css'), 'utf8'));
  const html = `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="theme-color" content="#f9f9ff"><title>TICKET — Конструктор зала · Прототип</title><style>${css}</style></head><body><div id="root"></div><script>${js.replaceAll('</script', '<\\/script')}</script></body></html>`;
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist/index.html'), html);
  await writeFile(path.join(root, 'hall-prototype.html'), html);
  console.log('Built standalone prototype: dist/index.html');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await build();
