// Uso: node scripts/epubcheck.mjs <arquivo.epub>
// Baixa epubcheck (cache em .cache/) e roda `java -jar`. Exit != 0 em erro.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '5.2.1';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, '.cache');
const dir = join(cache, `epubcheck-${VERSION}`);
const jar = join(dir, 'epubcheck.jar');

async function ensureJar() {
  if (existsSync(jar)) return;
  mkdirSync(cache, { recursive: true });
  const url = `https://github.com/w3c/epubcheck/releases/download/v${VERSION}/epubcheck-${VERSION}.zip`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download falhou (${res.status}): ${url}`);
  const zipPath = join(cache, `epubcheck-${VERSION}.zip`);
  writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  const r = spawnSync('unzip', ['-q', '-o', zipPath, '-d', cache], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('unzip falhou');
  if (!existsSync(jar)) throw new Error(`jar não encontrado em ${dir}: ${readdirSync(cache).join(', ')}`);
}

const file = process.argv[2];
if (!file) {
  console.error('uso: node scripts/epubcheck.mjs <arquivo.epub>');
  process.exit(2);
}
try {
  await ensureJar();
} catch (e) {
  console.error(String(e));
  process.exit(2);
}
const r = spawnSync('java', ['-Duser.language=en', '-jar', jar, resolve(file)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
