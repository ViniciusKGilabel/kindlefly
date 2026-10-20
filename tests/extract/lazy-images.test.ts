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
