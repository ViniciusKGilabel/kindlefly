// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { KfError } from '../../src/core/errors';
import { extractFromDocument } from '../../src/extract/readability';

const load = (f: string) =>
  new DOMParser().parseFromString(readFileSync(`tests/fixtures/${f}`, 'utf8'), 'text/html');

test('blog-post: título, autor (byline), idioma e conteúdo sem nav/aside', () => {
  const r = extractFromDocument(load('blog-post.html'), 'https://blog.example.com/post');
  expect(r.title).toContain('Meu Post');
  expect(r.author).toBe('Maria Silva');
  expect(r.language).toBe('pt-BR');
  expect(r.kind).toBe('article');
  expect(r.sourceUrl).toBe('https://blog.example.com/post');
  expect(r.html).toContain('Seção um');
  expect(r.html).not.toContain('Sobre');
  expect(r.html).not.toContain('patrocinado');
});

test('sem byline: autor = siteName, senão hostname', () => {
  const noByline = load('blog-post.html');
  noByline.querySelector('meta[name="author"]')!.remove();
  noByline.querySelector('.byline')!.remove();
  expect(extractFromDocument(noByline, 'https://blog.example.com/p').author).toBe('Blog da Maria');
  const r = extractFromDocument(load('no-headings.html'), 'https://www.plain.org/x');
  expect(r.author).toBe('www.plain.org');
  expect(r.language).toBe('en');
});

test('título vazio cai para o hostname', () => {
  const d = load('no-headings.html');
  d.querySelector('title')!.textContent = '   ';
  expect(extractFromDocument(d, 'https://plain.org/x').title).toBe('plain.org');
});

test('página sem artigo → KfError extract_failed', () => {
  const d = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
  try {
    extractFromDocument(d, 'https://x.org/');
    expect.unreachable();
  } catch (e) {
    expect(e).toBeInstanceOf(KfError);
    expect((e as KfError).code).toBe('extract_failed');
  }
});

test('título sem sufixo Read Online', () => {
  const doc = new DOMParser().parseFromString(
    '<html><head><title>Shadow Slave Chapter 450 - Read Online</title></head><body><article><h1>Shadow Slave Chapter 450 - Read Online</h1><p>' + 'texto longo '.repeat(80) + '</p></article></body></html>', 'text/html');
  expect(extractFromDocument(doc, 'https://x.com/a').title).toBe('Shadow Slave Chapter 450');
});
