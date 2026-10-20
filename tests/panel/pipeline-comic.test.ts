// @vitest-environment jsdom
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';
import { itemToEpub, itemsToEpubs } from '../../src/panel/pipeline';
import type { QueueItem } from '../../src/queue/queue';

// JPEG 1x1 sintético, válido (gerado localmente; sem conteúdo de terceiros).
const JPEG = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAaADAAQAAAABAAAAAQAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMABgYGBgYGCgYGCg4KCgoOEg4ODg4SFxISEhISFxwXFxcXFxccHBwcHBwcHCIiIiIiIicnJycnLCwsLCwsLCwsLP/bAEMBBwcHCwoLEwoKEy4fGh8uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLv/dAAQAAf/aAAwDAQACEQMRAD8A7OiiivHP0k//2Q==', 'base64'));
const hasJava = spawnSync('java', ['-version']).status === 0;

const comic = (o: Partial<QueueItem> = {}): QueueItem => ({
  id: 'c', sourceUrl: 'https://x.test/ch/1', title: 'Quadrinho & Cia <1>', author: 'Autor', language: 'en', html: '',
  kind: 'comic', images: ['https://x.test/p0.jpg', 'https://x.test/tall.jpg', 'https://x.test/p2.jpg'],
  selected: true, addedAt: 1, ...o,
});
const embed = {
  fetchImage: async (u: string) => new Blob([u]),
  convert: async (b: Blob) => {
    const slices = (await b.text()).includes('tall') ? 2 : 1;
    return Array.from({ length: slices }, () => ({ data: JPEG, width: 1, height: 1 }));
  },
};
const check = (data: Uint8Array) => {
  const p = join(mkdtempSync(join(tmpdir(), 'kf-')), 'a.epub');
  writeFileSync(p, data);
  const r = spawnSync('node', ['scripts/epubcheck.mjs', p], { encoding: 'utf8' });
  return r.stdout + r.stderr;
};

test('comic: 3 imagens (uma com 2 fatias) → 4 kf-page, 4 JPEGs, h1 no TOC', async () => {
  const r = await itemsToEpubs([comic()], { grayscale: true, embed });
  expect(r.failedImages).toBe(0);
  const zip = await JSZip.loadAsync(r.files[0]!.data);
  const ch = await zip.file('OEBPS/chapters/c1.xhtml')!.async('string');
  expect(ch.match(/<div class="kf-page"><img src="\.\.\/images\/i\d-\d\.jpg" alt="" \/><\/div>/g)).toHaveLength(4);
  expect(ch).toContain('<h1 id="h-1">Quadrinho &amp; Cia &lt;1&gt;</h1>');
  expect(ch).not.toContain('kf-img');
  const jpgs = Object.keys(zip.files).filter((f) => f.startsWith('OEBPS/images/') && f.endsWith('.jpg'));
  expect(jpgs).toHaveLength(4);
  expect(await zip.file('OEBPS/style.css')!.async('string')).toContain('.kf-page { page-break-before: always;');
  expect(await zip.file('OEBPS/nav.xhtml')!.async('string')).toContain('Quadrinho &amp; Cia &lt;1&gt;');
});

test('comic: imagem que falha some com sua página e é contada', async () => {
  const r = await itemsToEpubs([comic()], {
    grayscale: true,
    embed: { ...embed, fetchImage: async (u: string) => { if (u.includes('p0')) throw new Error('x'); return new Blob([u]); } },
  });
  expect(r.failedImages).toBe(1);
  const ch = await (await JSZip.loadAsync(r.files[0]!.data)).file('OEBPS/chapters/c1.xhtml')!.async('string');
  expect(ch.match(/kf-page/g)).toHaveLength(3);
});

test('merge: quadrinho + artigo + quadrinho → um capítulo por parte', async () => {
  const merged: QueueItem = {
    ...comic({ id: 'm', title: 'Livro 1–3', html: '', images: undefined }), kind: 'merged', sourceUrl: 'merged:m',
    parts: [
      { title: 'Cap 1', html: '', sourceUrl: 'u1', images: ['https://x.test/a.jpg', 'https://x.test/b.jpg'] },
      { title: 'Cap 2', html: '<p>texto</p><img src="https://x.test/fig.jpg" alt="F">', sourceUrl: 'u2' },
      { title: 'Cap 3', html: '', sourceUrl: 'u3', images: ['https://x.test/tall.jpg'] },
    ],
  };
  const r = await itemsToEpubs([merged], { grayscale: true, embed });
  const zip = await JSZip.loadAsync(r.files[0]!.data);
  const c = async (n: number) => zip.file(`OEBPS/chapters/c${n}.xhtml`)!.async('string');
  expect((await c(1)).match(/kf-page/g)).toHaveLength(2);
  expect(await c(2)).toMatch(/<p[^>]*>texto<\/p>/);
  expect(await c(2)).not.toContain('kf-page');
  expect((await c(3)).match(/kf-page/g)).toHaveLength(2);
  const nav = await zip.file('OEBPS/nav.xhtml')!.async('string');
  for (const t of ['Cap 1', 'Cap 2', 'Cap 3']) expect(nav).toContain(t);
  if (hasJava) expect(check(r.files[0]!.data)).toContain('No errors or warnings detected');
}, 120_000);

test.skipIf(!hasJava)('epubcheck: EPUB de quadrinho com JPEGs reais', async () => {
  const r = await itemsToEpubs([comic()], { grayscale: true, embed });
  expect(check(r.files[0]!.data)).toContain('No errors or warnings detected');
}, 120_000);

describe('quadrinho sem nenhuma página (D)', () => {
  const failing = { ...embed, fetchImage: async () => { throw new Error('offline'); } };
  const failOn = (frag: string) => ({
    ...embed,
    fetchImage: async (u: string) => { if (u.includes(frag)) throw new Error('x'); return new Blob([u]); },
  });
  const article: QueueItem = {
    id: 'a', sourceUrl: 'https://x.test/a', title: 'Artigo', author: 'A', language: 'en',
    html: '<p>texto</p>', kind: 'article', selected: true, addedAt: 1,
  };
  const mergedOf = (parts: NonNullable<QueueItem['parts']>): QueueItem => ({
    ...comic({ id: 'm', title: 'Livro', images: undefined }), kind: 'merged', sourceUrl: 'merged:m', parts,
  });

  test('itemToEpub: quadrinho sem páginas → KfError image_failed', async () => {
    await expect(itemToEpub(comic(), { title: '', author: '' }, { grayscale: true, embed: failing }))
      .rejects.toMatchObject({ code: 'image_failed', message: expect.stringContaining('nenhuma página') });
  });

  test('itemsToEpubs: item sem páginas falha sozinho; os outros seguem e o título é informado', async () => {
    const r = await itemsToEpubs([comic(), article], { grayscale: true, embed: failing });
    expect(r.files.map((f) => f.filename)).toEqual(['Artigo.epub']);
    expect(r.failedItems).toEqual(['Quadrinho & Cia <1>']);
    expect(r.failedImages).toBe(0);
  });

  test('juntado: capítulo de quadrinho sem páginas sai do livro (e do sumário)', async () => {
    const merged = mergedOf([
      { title: 'Cap 1', html: '', sourceUrl: 'u1', images: ['https://x.test/ok.jpg'] },
      { title: 'Cap 2', html: '', sourceUrl: 'u2', images: ['https://x.test/bad1.jpg', 'https://x.test/bad2.jpg'] },
      { title: 'Cap 3', html: '<p>texto</p>', sourceUrl: 'u3' },
    ]);
    const r = await itemsToEpubs([merged], { grayscale: true, embed: failOn('bad') });
    expect(r.failedItems).toEqual([]);
    expect(r.failedImages).toBe(2);
    const zip = await JSZip.loadAsync(r.files[0]!.data);
    const chapters = Object.keys(zip.files).filter((f) => /chapters\/c\d+\.xhtml$/.test(f));
    expect(chapters).toHaveLength(2);
    const nav = await zip.file('OEBPS/nav.xhtml')!.async('string');
    expect(nav).toContain('Cap 1');
    expect(nav).not.toContain('Cap 2');
    expect(nav).toContain('Cap 3');
    if (hasJava) expect(check(r.files[0]!.data)).toContain('No errors or warnings detected');
  }, 120_000);

  test('juntado sem nenhuma parte válida → item falha', async () => {
    const merged = mergedOf([
      { title: 'Cap 1', html: '', sourceUrl: 'u1', images: ['https://x.test/a.jpg'] },
      { title: 'Cap 2', html: '', sourceUrl: 'u2', images: ['https://x.test/b.jpg'] },
    ]);
    const r = await itemsToEpubs([merged], { grayscale: true, embed: failing });
    expect(r.files).toEqual([]);
    expect(r.failedItems).toEqual(['Livro']);
  });
});
