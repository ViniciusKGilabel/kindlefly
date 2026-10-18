// @vitest-environment jsdom
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { expect, test } from 'vitest';
import { sanitizeFilename } from '../../src/core/filename';
import type { ExtractedItem } from '../../src/core/types';
import { itemToEpub } from '../../src/panel/pipeline';

const item: ExtractedItem = {
  id: 'x', sourceUrl: 'https://example.com/post', title: 'Original', author: 'Site', language: 'pt-BR',
  html: '<h1>Introdução</h1><p>Texto &amp; mais texto.</p><h2>Parte</h2><p>Fim.</p>', kind: 'article',
};
const edits = { title: 'Meu: Título/Editado?', author: 'Fulano & Cia' };
const hasJava = spawnSync('java', ['-version']).status === 0;

test('itemToEpub usa título e autor editados e o nome sanitizado', async () => {
  const file = await itemToEpub(item, edits);
  expect(file.filename).toBe(sanitizeFilename(edits.title) + '.epub');
  const opf = await (await JSZip.loadAsync(file.data)).file('OEBPS/content.opf')!.async('string');
  expect(opf).toContain('<dc:title>Meu: Título/Editado?</dc:title>');
  expect(opf).toContain('<dc:creator>Fulano &amp; Cia</dc:creator>');
  expect(opf).toContain('<dc:language>pt-BR</dc:language>');
});

test('idioma ausente cai para en', async () => {
  const file = await itemToEpub({ ...item, language: '' }, edits);
  const opf = await (await JSZip.loadAsync(file.data)).file('OEBPS/content.opf')!.async('string');
  expect(opf).toContain('<dc:language>en</dc:language>');
});

test.skipIf(!hasJava)('arquivo gerado passa no epubcheck', async () => {
  const file = await itemToEpub(item, edits);
  const p = join(mkdtempSync(join(tmpdir(), 'kf-')), 'a.epub');
  writeFileSync(p, file.data);
  const r = spawnSync('node', ['scripts/epubcheck.mjs', p], { encoding: 'utf8' });
  expect(r.stdout + r.stderr).toContain('No errors or warnings detected');
}, 120_000);
