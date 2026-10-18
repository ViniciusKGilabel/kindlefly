// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { htmlToChapter } from '../../src/extract/to-chapter';

const dirty = readFileSync('tests/fixtures/dirty.html', 'utf8');
const opts = { id: 'c1', title: 'Título' };

test('dirty.html vira XHTML que o DOMParser em application/xhtml+xml aceita sem parsererror', () => {
  const ch = htmlToChapter(dirty, opts);
  const doc = new DOMParser().parseFromString(
    `<html xmlns="http://www.w3.org/1999/xhtml"><body>${ch.xhtmlBody}</body></html>`,
    'application/xhtml+xml',
  );
  expect(doc.getElementsByTagName('parsererror').length).toBe(0);
});

test('remove onclick, javascript:, iframe, form, script, img', () => {
  const b = htmlToChapter(dirty, opts).xhtmlBody;
  for (const bad of ['onclick', 'javascript:', 'iframe', '<form', 'script', '<img', 'style', 'class=', 'orig', 'svg', 'input', 'button']) {
    expect(b).not.toContain(bad);
  }
  expect(b).toContain('https://example.com/a?b=1&amp;c=2');
  expect(b).toContain('href="#frag"');
  expect(b).not.toContain('/rel');
});

test('&nbsp; e tags não fechadas não quebram', () => {
  const b = htmlToChapter('<p>a&nbsp;b<br><p>c<ul><li>x<li>y</ul>', opts).xhtmlBody;
  expect(b).not.toContain('&nbsp;');
  expect(b).toContain('<br />');
});

test('headings recebem h-1, h-2… e voltam em ordem com nível e texto', () => {
  const ch = htmlToChapter('<h1>A</h1><p>x</p><h2>B b</h2><h3>C</h3>', { id: 'c', title: 'A' });
  expect(ch.headings).toEqual([
    { level: 1, text: 'A', anchor: 'h-1' },
    { level: 2, text: 'B b', anchor: 'h-2' },
    { level: 3, text: 'C', anchor: 'h-3' },
  ]);
  expect(ch.xhtmlBody).toContain('id="h-2"');
});

test('prepende h1 com o título quando ausente; não duplica quando presente', () => {
  const a = htmlToChapter('<p>x</p>', { id: 'c', title: 'Meu Título' });
  expect(a.headings[0]).toEqual({ level: 1, text: 'Meu Título', anchor: 'h-1' });
  const b = htmlToChapter('<h1>Meu Título</h1><p>x</p>', { id: 'c', title: 'Meu Título' });
  expect(b.headings.filter((h) => h.level === 1)).toHaveLength(1);
});

test('título vazio nunca gera h1 vazio', () => {
  const ch = htmlToChapter('<p>x</p>', { id: 'c', title: '  ' });
  expect(ch.title.trim()).not.toBe('');
  expect(ch.headings.every((h) => h.text.trim() !== '')).toBe(true);
});
