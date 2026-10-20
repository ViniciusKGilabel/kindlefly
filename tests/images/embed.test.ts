// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { KfError } from '../../src/core/errors';
import type { Chapter } from '../../src/core/types';
import { embedImages } from '../../src/images/embed';

const ch = (id: string, body: string, imageUrls: string[]): Chapter => ({ id, title: id, xhtmlBody: body, headings: [], imageUrls });
const fetchImage = async (url: string) => new Blob([url]);
const convert = async (blob: Blob) => {
  const url = await blob.text();
  const n = url.includes('tall') ? 3 : 1;
  return Array.from({ length: n }, (_, k) => ({ data: new Uint8Array([k]), width: 10, height: 10 }));
};
const base = { fetchFn: (async () => new Response()) as unknown as typeof fetch, grayscale: true, fetchImage, convert };

describe('embedImages', () => {
  test('substitui marcador por img ../images/i{N}-{k}.jpg com alt escapado', async () => {
    const r = await embedImages([ch('c1', '<p><img src="kf-img:0" alt="a &amp; &quot;b&quot;" /></p>', ['https://x/a.jpg'])], base);
    expect(r.failed).toBe(0);
    expect(r.images).toHaveLength(1);
    expect(r.images[0]).toMatchObject({ href: 'i0-0.jpg', mediaType: 'image/jpeg' });
    expect(r.chapters[0]!.xhtmlBody).toBe('<p><img src="../images/i0-0.jpg" alt="a &amp; &quot;b&quot;" /></p>');
  });
  test('fatias múltiplas viram várias img', async () => {
    const r = await embedImages([ch('c1', '<img src="kf-img:0"/>', ['https://x/tall.jpg'])], base);
    expect(r.images.map((i) => i.href)).toEqual(['i0-0.jpg', 'i0-1.jpg', 'i0-2.jpg']);
    expect(r.chapters[0]!.xhtmlBody.match(/<img /g)).toHaveLength(3);
    expect(r.chapters[0]!.xhtmlBody).toContain('alt=""');
  });
  test('falha remove a img e conta uma vez por URL', async () => {
    const r = await embedImages(
      [ch('c1', '<img src="kf-img:0" alt="x"/><img src="kf-img:1" alt="y"/>', ['https://x/bad.jpg', 'https://x/ok.jpg'])],
      { ...base, fetchImage: async (u: string) => { if (u.includes('bad')) throw new KfError('image_failed'); return new Blob([u]); } },
    );
    expect(r.failed).toBe(1);
    expect(r.chapters[0]!.xhtmlBody).not.toContain('kf-img');
    expect(r.chapters[0]!.xhtmlBody).toContain('../images/i1-0.jpg');
    expect(r.chapters[0]!.xhtmlBody).not.toContain('alt="x"');
  });
  test('conversão que falha também remove e conta', async () => {
    const r = await embedImages([ch('c1', '<img src="kf-img:0"/>', ['https://x/a.jpg'])], { ...base, convert: async () => { throw new KfError('image_failed'); } });
    expect(r.failed).toBe(1);
    expect(r.images).toEqual([]);
    expect(r.chapters[0]!.xhtmlBody).toBe('');
  });
  test('mesma URL em vários capítulos: baixa uma vez, índice global sem colisão', async () => {
    let calls = 0;
    const r = await embedImages(
      [ch('c1', '<img src="kf-img:0"/>', ['https://x/a.jpg']), ch('c2', '<img src="kf-img:0"/><img src="kf-img:1"/>', ['https://x/a.jpg', 'https://x/b.jpg'])],
      { ...base, fetchImage: async (u: string) => { calls++; return new Blob([u]); } },
    );
    expect(calls).toBe(2);
    expect(r.images.map((i) => i.href)).toEqual(['i0-0.jpg', 'i1-0.jpg']);
    expect(r.chapters[1]!.xhtmlBody).toBe('<img src="../images/i0-0.jpg" alt="" /><img src="../images/i1-0.jpg" alt="" />');
  });
  test('capítulo sem imagens passa intacto; onProgress; concorrência limitada', async () => {
    const prog: Array<[number, number]> = [];
    let cur = 0, max = 0;
    const urls = Array.from({ length: 10 }, (_, i) => `https://x/${i}.jpg`);
    const body = urls.map((_, i) => `<img src="kf-img:${i}"/>`).join('');
    const r = await embedImages([ch('c0', '<p>oi</p>', []), ch('c1', body, urls)], {
      ...base, onProgress: (d, t) => prog.push([d, t]),
      fetchImage: async (u: string) => { cur++; max = Math.max(max, cur); await new Promise((s) => setTimeout(s, 2)); cur--; return new Blob([u]); },
    });
    expect(r.chapters[0]!.xhtmlBody).toBe('<p>oi</p>');
    expect(max).toBeLessThanOrEqual(4);
    expect(prog.at(-1)).toEqual([10, 10]);
  });
  test('AbortError propaga', async () => {
    const e = Object.assign(new Error('x'), { name: 'AbortError' });
    await expect(embedImages([ch('c1', '<img src="kf-img:0"/>', ['https://x/a.jpg'])], { ...base, fetchImage: async () => { throw e; } })).rejects.toBe(e);
  });
});

test('alt com quebra de linha e & sai válido e escapado uma vez', async () => {
  const doc = new DOMParser().parseFromString('<p><img src="kf-img:0" alt="a &amp; b\nc"></p>', 'text/html');
  const body = new XMLSerializer().serializeToString(doc.body.firstChild!);
  const r = await embedImages([ch('c1', body, ['https://x/a.jpg'])], base);
  expect(r.chapters[0]!.xhtmlBody).toContain('alt="a &amp; b c"');
});
