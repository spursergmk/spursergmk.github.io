import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'public');
const output = resolve(root, 'dist');
const snapshot = JSON.parse(await readFile(resolve(source, 'data/library.json'), 'utf8'));
if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.playlists) || !snapshot.knownSource?.id) {
  throw new Error('public/data/library.json does not match the expected archive schema');
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
console.log(`Built static site at ${output}`);
