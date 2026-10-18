// @vitest-environment jsdom
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { buildEpub } from '../../src/epub/build';
import { htmlToChapter } from '../../src/extract/to-chapter';

const o = { id: 'c', title: 'T' };
const parses = (body: string) =>
  new DOMParser()
    .parseFromString(`<html xmlns="http://www.w3.org/1999/xhtml"><body>${body}</body></html>`, 'application/xhtml+xml')
    .getElementsByTagName('parsererror').length === 0;

const nasty =
  '<p>a<o:p></o:p>b <x-widget>kept</x-widget>\u000Bz</p>' +
  '<h2>Sec</h2><p><a href="#fn1">dangling</a> <a href="#h-2">ok</a></p>' +
  '<div colspan="2" rowspan="3" href="http://x.com">d</div>' +
  '<link rel="stylesheet" href="http://x.com/a.css"><meta name="x" content="y"><base href="http://x.com/">' +
  '<table><tr><td colspan="2">c</table>';

test('tag com namespace vira texto, XML válido', () => {
  const b = htmlToChapter('<p>a<o:p></o:p>b</p><x-widget>w</x-widget>', o).xhtmlBody;
  expect(b).not.toContain('o:p');
  expect(b).toContain('w');
  expect(parses(b)).toBe(true);
});

test('caractere de controle é removido', () => {
  const b = htmlToChapter('<p>x\u000By\u0000z</p>', o).xhtmlBody;
  expect(b).toContain('xyz');
  expect(parses(b)).toBe(true);
});

test('link para fragmento inexistente vira texto; válido permanece', () => {
  const b = htmlToChapter('<h2>Sec</h2><p><a href="#fn1">dangling</a> <a href="#h-2">ok</a></p>', o).xhtmlBody;
  expect(b).not.toContain('#fn1');
  expect(b).toContain('dangling');
  expect(b).toContain('href="#h-2"');
});

test('colspan só em td/th, href só em a; link/meta/base removidos', () => {
  const b = htmlToChapter(nasty, o).xhtmlBody;
  expect(b).toContain('<td colspan="2"');
  expect(b).not.toMatch(/<div[^>]*(colspan|rowspan|href)/);
  expect(b).not.toMatch(/<(link|meta|base)\b/);
});

const hasJava = spawnSync('java', ['-version']).status === 0;
test.skipIf(!hasJava)('conteúdo sujo passa no epubcheck', async () => {
  const ch = htmlToChapter(nasty, o);
  const file = join(mkdtempSync(join(tmpdir(), 'kf-')), 'b.epub');
  writeFileSync(
    file,
    await buildEpub({
      title: 'T', author: 'A', language: 'en', identifier: 'urn:uuid:11111111-1111-4111-8111-111111111111',
      modified: new Date('2026-10-18T12:00:00Z'), chapters: [ch], images: [],
    }),
  );
  const r = spawnSync('node', ['scripts/epubcheck.mjs', file], { encoding: 'utf8' });
  expect(r.stdout + r.stderr).toContain('No errors or warnings detected');
}, 120_000);

test('atributos com nomes herdados de Object (constructor, toString, __proto__) são descartados sem erro', () => {
  const html =
    '<p constructor="1" tostring="2" __proto__="3" hasownproperty="4" valueof="5">a</p>';
  let b = '';
  expect(() => { b = htmlToChapter(html, o).xhtmlBody; }).not.toThrow();
  expect(b).toContain('>a</p>');
  expect(b).not.toMatch(/constructor|tostring|__proto__|hasownproperty|valueof/i);
});
