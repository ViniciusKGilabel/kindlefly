// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { resolveLazyImages } from '../../src/extract/lazy-images';

const run = (imgHtml: string, base = 'https://site.example/a/b/page') => {
  const doc = new DOMParser().parseFromString(`<body>${imgHtml}</body>`, 'text/html');
  resolveLazyImages(doc, base);
  return doc.querySelector('img')!;
};

describe('resolveLazyImages', () => {
  test.each(['data-src', 'data-lazy-src', 'data-original'])('%s vira src', (attr) => {
    const img = run(`<img src="data:image/gif;base64,R0lG" ${attr}="https://cdn.example/x.jpg">`);
    expect(img.getAttribute('src')).toBe('https://cdn.example/x.jpg');
  });
  test('relativo vira absoluto', () => {
    expect(run('<img src="../img/x.png">').getAttribute('src')).toBe('https://site.example/a/img/x.png');
    expect(run('<img data-src="/y.png">').getAttribute('src')).toBe('https://site.example/y.png');
  });
  test('srcset: pega o maior (w e x) e remove srcset/sizes', () => {
    const img = run('<img src="s.jpg" srcset="a.jpg 400w, b.jpg 1200w, c.jpg 800w" sizes="100vw">');
    expect(img.getAttribute('src')).toBe('https://site.example/a/b/b.jpg');
    expect(img.hasAttribute('srcset')).toBe(false);
    expect(img.hasAttribute('sizes')).toBe(false);
    expect(run('<img srcset="a.jpg 1x, b.jpg 2x">').getAttribute('src')).toBe('https://site.example/a/b/b.jpg');
  });
  test('data-srcset também conta', () => {
    expect(run('<img data-srcset="a.jpg 100w, b.jpg 300w">').getAttribute('src')).toBe('https://site.example/a/b/b.jpg');
  });
  test('img sem nada fica como está; data: placeholder preservado quando não há alternativa', () => {
    expect(run('<img alt="x">').hasAttribute('src')).toBe(false);
  });
  test('source dentro de picture com srcset: img sem src herda', () => {
    const doc = new DOMParser().parseFromString(
      '<body><picture><source srcset="a.webp 100w, b.webp 900w"><img alt="p"></picture></body>', 'text/html');
    resolveLazyImages(doc, 'https://site.example/');
    expect(doc.querySelector('img')!.getAttribute('src')).toBe('https://site.example/b.webp');
  });
});

describe('data: e srcset', () => {
  test('src data: é tratado como vazio (data-src vence; srcset vence)', () => {
    expect(run('<img src="data:image/gif;base64,AAA" srcset="a.jpg 1x, b.jpg 2x">').getAttribute('src')).toBe('https://site.example/a/b/b.jpg');
  });
  test('picture source vence src data:', () => {
    const doc = new DOMParser().parseFromString('<body><picture><source srcset="z.webp 500w"><img src="data:image/gif;base64,AAA"></picture></body>', 'text/html');
    resolveLazyImages(doc, 'https://site.example/');
    expect(doc.querySelector('img')!.getAttribute('src')).toBe('https://site.example/z.webp');
  });
  test('candidatos data: ignorados; data-srcset vence srcset só-data', () => {
    const img = run('<img srcset="data:image/gif;base64,AAA 1x" data-srcset="r.jpg 300w, q.jpg 100w">');
    expect(img.getAttribute('src')).toBe('https://site.example/a/b/r.jpg');
  });
  test('vírgula sem espaço separa; vírgula dentro da URL não', () => {
    expect(run('<img srcset="a.jpg 1x,b.jpg 2x">').getAttribute('src')).toBe('https://site.example/a/b/b.jpg');
    expect(run('<img srcset="https://c.test/w_100,h_50/a.jpg 100w, https://c.test/w_900,h_50/a.jpg 900w">').getAttribute('src'))
      .toBe('https://c.test/w_900,h_50/a.jpg');
  });
});
