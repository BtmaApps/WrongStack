import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function portableDirectory(appDir: string): string {
  const root = join(appDir, 'dist-native');
  if (!existsSync(join(root, 'latest.json'))) return root;
  const latest = JSON.parse(readFileSync(join(root, 'latest.json'), 'utf8')) as {
    directory?: unknown;
  };
  if (typeof latest.directory !== 'string' || !/^[a-f0-9]{12}-[a-f0-9]{12}$/.test(latest.directory))
    throw new Error('Invalid portable build identity.');
  return join(root, latest.directory);
}
export function stagePortable(appDir: string): string {
  const files = [
    ['src-tauri/target/release/wrongstack-desktop-native.exe', 'wrongstack-desktop-native.exe'],
    ['binaries/wrongstack-engine.exe', 'wrongstack-engine.exe'],
  ] as const;
  const hashes = files.map(([source]) =>
    createHash('sha256')
      .update(readFileSync(join(appDir, source)))
      .digest('hex'),
  );
  const identity = hashes.map((hash) => hash.slice(0, 12)).join('-');
  const root = join(appDir, 'dist-native');
  const portable = join(root, identity);
  mkdirSync(portable, { recursive: true });
  const sums = files.map(([source, name]) => {
    const file = join(portable, name);
    if (!existsSync(file)) copyFileSync(join(appDir, source), file);
    const expected = hashes[files.findIndex((entry) => entry[1] === name)];
    if (createHash('sha256').update(readFileSync(file)).digest('hex') !== expected)
      throw new Error(`Portable artifact identity changed: ${name}`);
    return `${createHash('sha256').update(readFileSync(file)).digest('hex')}  ${name}`;
  });
  writeFileSync(join(portable, 'SHA256SUMS'), `${sums.join('\n')}\n`);
  writeFileSync(join(root, 'latest.json'), JSON.stringify({ directory: identity }, null, 2) + '\n');
  return portable;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.log(stagePortable(fileURLToPath(new URL('../', import.meta.url))));
}
