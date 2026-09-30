// Copy only public browser files. Supabase secrets, firmware, and the Windows
// controller app must never be part of a static Netlify deployment.
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'web-dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const files = [
  'index.html', 'student.html', 'lesson_builder.html', 'device_setup.html',
  'style.css', 'lesson_builder.css', 'content_manager.js',
  'device_setup.js', 'lesson_builder.js', 'security.js', 'settings_manager.js',
];
for (const file of files) {
  if (!existsSync(join(root, file))) throw new Error(`Missing public file: ${file}`);
  cpSync(join(root, file), join(out, file));
}
for (const folder of ['js', 'games']) cpSync(join(root, folder), join(out, folder), { recursive: true });
const assets = ['tailwind.js', 'xlsx.full.min.js', 'Sortable.min.js', 'socket.io.min.js'];
for (const name of assets) {
  const source = join(root, 'assets', name);
  if (existsSync(source)) {
    mkdirSync(join(out, 'assets'), { recursive: true });
    cpSync(source, join(out, 'assets', name));
  }
}
if (existsSync(join(root, 'assets', 'images'))) {
  cpSync(join(root, 'assets', 'images'), join(out, 'assets', 'images'), { recursive: true });
}
const faCss = join(root, 'assets', 'fontawesome', 'css', 'all.min.css');
if (existsSync(faCss)) {
  const target = join(out, 'assets', 'fontawesome', 'css', 'all.min.css');
  mkdirSync(dirname(target), { recursive: true });
  cpSync(faCss, target);
  cpSync(join(root, 'assets', 'fontawesome', 'webfonts'),
    join(out, 'assets', 'fontawesome', 'webfonts'),
    { recursive: true, filter: path => path.endsWith('webfonts') || /\.(?:woff2?|ttf)$/.test(path) });
}
console.log(`Public site prepared in ${out}`);
