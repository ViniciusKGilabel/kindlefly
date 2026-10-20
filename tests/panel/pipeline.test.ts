// @vitest-environment jsdom
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { expect, test } from 'vitest';
import { sanitizeFilename } from '../../src/core/filename';
import type { ExtractedItem } from '../../src/core/types';
import { itemToEpub, itemsToEpubs } from '../../src/panel/pipeline';

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

test('título vazio cai para o título extraído; autor vazio para o extraído', async () => {
  const file = await itemToEpub(item, { title: '   ', author: '' });
  const opf = await (await JSZip.loadAsync(file.data)).file('OEBPS/content.opf')!.async('string');
  expect(opf).toContain('<dc:title>Original</dc:title>');
  expect(opf).toContain('<dc:creator>Site</dc:creator>');
  expect(file.filename).toBe('Original.epub');
});

test('título e autor vazios em tudo → dc:title e dc:creator não vazios', async () => {
  const file = await itemToEpub({ ...item, title: '', author: '' }, { title: '', author: '' });
  const opf = await (await JSZip.loadAsync(file.data)).file('OEBPS/content.opf')!.async('string');
  expect(opf).toMatch(/<dc:title>[^<]+<\/dc:title>/);
  expect(opf).toContain('<dc:creator>kindlefly</dc:creator>');
});

test.skipIf(!hasJava)('título vazio gera EPUB válido no epubcheck', async () => {
  const file = await itemToEpub(item, { title: '', author: '' });
  const p = join(mkdtempSync(join(tmpdir(), 'kf-')), 'a.epub');
  writeFileSync(p, file.data);
  const r = spawnSync('node', ['scripts/epubcheck.mjs', p], { encoding: 'utf8' });
  expect(r.stdout + r.stderr).toContain('No errors or warnings detected');
}, 120_000);

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

test('itemsToEpubs: títulos iguais ganham sufixo e usa título editado do item', async () => {
  const mk = (id: string, title: string) => ({ ...item, id, title, selected: true, addedAt: 1 });
  const files = await itemsToEpubs([mk('1', 'X'), mk('2', 'X'), mk('3', 'X'), mk('4', 'Editado')]);
  expect(files.map((f) => f.filename)).toEqual(['X.epub', 'X (2).epub', 'X (3).epub', 'Editado.epub']);
  const opf = await (await JSZip.loadAsync(files[3]!.data)).file('OEBPS/content.opf')!.async('string');
  expect(opf).toContain('<dc:title>Editado</dc:title>');
});

test('itemsToEpubs: item merged → 1 arquivo, N capítulos no nav', async () => {
  const merged = {
    ...item, id: 'm', kind: 'merged' as const, html: '', sourceUrl: 'merged:m', title: 'Livro 1–2', selected: true, addedAt: 1,
    parts: [
      { title: 'Cap Um', html: '<p>um</p>', sourceUrl: 'u1' },
      { title: 'Cap Dois', html: '<p>dois</p>', sourceUrl: 'u2' },
    ],
  };
  const files = await itemsToEpubs([merged]);
  expect(files).toHaveLength(1);
  expect(files[0]!.filename).toBe('Livro 1–2.epub');
  const zip = await JSZip.loadAsync(files[0]!.data);
  const nav = await zip.file('OEBPS/nav.xhtml')!.async('string');
  expect(nav).toContain('Cap Um');
  expect(nav).toContain('Cap Dois');
  if (hasJava) {
    const p = join(mkdtempSync(join(tmpdir(), 'kf-')), 'a.epub');
    writeFileSync(p, files[0]!.data);
    const r = spawnSync('node', ['scripts/epubcheck.mjs', p], { encoding: 'utf8' });
    expect(r.stdout + r.stderr).toContain('No errors or warnings detected');
  }
}, 120_000);
