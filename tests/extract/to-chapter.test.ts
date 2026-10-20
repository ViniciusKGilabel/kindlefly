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
  expect(b).not.toContain('#frag');
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

test('img http(s) é mantida com marcador kf-img:N e alt; imageUrls em ordem', () => {
  const ch = htmlToChapter('<p><img src="https://x.test/a.jpg" alt="Foto &amp; cia" class="c" width="3"></p><img src="https://x.test/b.jpg">', opts);
  expect(ch.imageUrls).toEqual(['https://x.test/a.jpg', 'https://x.test/b.jpg']);
  expect(ch.xhtmlBody).toContain('<img src="kf-img:0" alt="Foto &amp; cia" />');
  expect(ch.xhtmlBody).toContain('kf-img:1');
  expect(ch.xhtmlBody).not.toContain('class=');
  expect(ch.xhtmlBody).not.toContain('width=');
});

test('URL repetida reusa o mesmo índice', () => {
  const ch = htmlToChapter('<img src="https://x.test/a.jpg"><img src="https://x.test/a.jpg"><img src="https://x.test/b.jpg">', opts);
  expect(ch.imageUrls).toEqual(['https://x.test/a.jpg', 'https://x.test/b.jpg']);
  expect(ch.xhtmlBody.match(/kf-img:0/g)).toHaveLength(2);
});

test('picture é desembrulhada, source removido', () => {
  const ch = htmlToChapter('<picture><source srcset="https://x.test/a.webp"><img src="https://x.test/a.jpg" alt="p"></picture>', opts);
  expect(ch.xhtmlBody).not.toContain('picture');
  expect(ch.xhtmlBody).not.toContain('source');
  expect(ch.imageUrls).toEqual(['https://x.test/a.jpg']);
});

test('data:, javascript: e relativas são descartadas', () => {
  const ch = htmlToChapter('<img src="data:image/png;base64,AAAA"><img src="javascript:x()"><img src="a.png"><img>', opts);
  expect(ch.xhtmlBody).not.toContain('<img');
  expect(ch.imageUrls ?? []).toEqual([]);
});

test('sem imagens: imageUrls vazio', () => {
  expect(htmlToChapter('<p>x</p>', opts).imageUrls ?? []).toEqual([]);
});

test('img mantém só src e alt (title some)', () => {
  const ch = htmlToChapter('<img src="https://x.test/a.jpg" alt="a" title="t">', opts);
  expect(ch.xhtmlBody).not.toContain('title=');
});
