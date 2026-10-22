import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { buildEpub } from '../../src/epub/build';
import type { Book } from '../../src/core/types';

const hasJava = spawnSync('java', ['-version']).status === 0;

test.skipIf(!hasJava)('livro de 2 capítulos com títulos e entidades passa no epubcheck', async () => {
  const book: Book = {
    title: 'Livro & "Teste" <1> ação 📚', author: 'Autor & Cia', language: 'pt-BR',
    identifier: 'urn:uuid:11111111-1111-4111-8111-111111111111',
    modified: new Date('2026-10-18T12:00:00Z'),
    chapters: [
      { id: '1', title: 'Um & Dois', headings: [
        { level: 1, text: 'Intro <b>', anchor: 'intro' }, { level: 3, text: 'Fundo', anchor: 'fundo' },
        { level: 2, text: 'Meio', anchor: 'meio' } ],
        xhtmlBody: '<h1 id="intro" xmlns="http://www.w3.org/1999/xhtml">Intro &lt;b&gt;</h1><h3 id="fundo">Fundo</h3><h2 id="meio">Meio</h2><p>a &amp; b&#160;c</p>' },
      { id: '2', title: 'Sem headings "x"', headings: [], xhtmlBody: '<p>Texto</p>' },
    ],
    images: [],
  };
  const file = join(mkdtempSync(join(tmpdir(), 'kf-')), 'book.epub');
  writeFileSync(file, await buildEpub(book));
  const r = spawnSync('node', ['scripts/epubcheck.mjs', file], { encoding: 'utf8' });
  expect(r.stdout + r.stderr).toContain('No errors or warnings detected');
  expect(r.status).toBe(0);
}, 120_000);

test.skipIf(!hasJava)('livro com série passa no epubcheck', async () => {
  const book: Book = {
    title: 'Shadow Slave Chapter 450', author: 'site', language: 'en',
    identifier: 'urn:uuid:22222222-2222-4222-8222-222222222222',
    modified: new Date('2026-10-18T12:00:00Z'),
    chapters: [{ id: '1', title: 'Chapter 450', headings: [], xhtmlBody: '<p>Texto</p>' }],
    images: [],
    series: { name: 'Shadow Slave', position: 450.5 },
  };
  const file = join(mkdtempSync(join(tmpdir(), 'kf-')), 'series.epub');
  writeFileSync(file, await buildEpub(book));
  const r = spawnSync('node', ['scripts/epubcheck.mjs', file], { encoding: 'utf8' });
  expect(r.stdout + r.stderr).toContain('No errors or warnings detected');
  expect(r.status).toBe(0);
}, 120_000);
