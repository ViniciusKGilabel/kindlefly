// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { fetchChapter } from '../../src/range/fetch-chapter';

const URL_ = 'https://site.example/n/chapter/5';
const page = `<html lang="en"><head><title>Capítulo Cinco</title></head><body>
<nav>menu</nav><article><h1>Capítulo Cinco</h1>
<p>${'Texto sintético de teste. '.repeat(40)}</p>
<p>${'Mais texto sintético para o extrator. '.repeat(30)}</p>
<p><a href="/n/chapter/6">próximo</a></p></article></body></html>`;
const resp = (body: string, status = 200) => async () => new Response(body, { status });

describe('fetchChapter', () => {
  test('ok', async () => {
    const r = await fetchChapter(URL_, resp(page) as unknown as typeof fetch);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.item.sourceUrl).toBe(URL_);
      expect(r.item.title).toContain('Cinco');
      expect(r.item.html).toContain('Texto sintético');
    }
  });
  test('chama fetch com credentials include e signal', async () => {
    const ac = new AbortController();
    let init: RequestInit | undefined;
    await fetchChapter(URL_, (async (_u: string, i: RequestInit) => {
      init = i;
      return new Response(page);
    }) as unknown as typeof fetch, ac.signal);
    expect(init?.credentials).toBe('include');
    expect(init?.signal).toBe(ac.signal);
  });
  test('404 → http', async () => {
    expect(await fetchChapter(URL_, resp('x', 404) as unknown as typeof fetch)).toEqual({ ok: false, reason: 'http', status: 404 });
  });
  test('rejeição → network', async () => {
    const f = (async () => { throw new TypeError('fail'); }) as unknown as typeof fetch;
    expect(await fetchChapter(URL_, f)).toEqual({ ok: false, reason: 'network' });
  });
  test('sem artigo → extract', async () => {
    const r = await fetchChapter(URL_, resp('<html><body></body></html>') as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, reason: 'extract' });
  });
  test('link relativo vira absoluto', async () => {
    const r = await fetchChapter(URL_, resp(page) as unknown as typeof fetch);
    expect(r.ok && r.item.html).toContain('https://site.example/n/chapter/6');
  });
  test('base usa a URL final da resposta; sourceUrl é a pedida', async () => {
    const f = (async () => {
      const r = new Response(page);
      Object.defineProperty(r, 'url', { value: 'https://other.example/z/chapter/5' });
      return r;
    }) as unknown as typeof fetch;
    const r = await fetchChapter(URL_, f);
    expect(r.ok && r.item.sourceUrl).toBe(URL_);
    expect(r.ok && r.item.html).toContain('https://other.example/n/chapter/6');
  });
  test('abort propaga', async () => {
    const f = (async () => { throw new DOMException('aborted', 'AbortError'); }) as unknown as typeof fetch;
    await expect(fetchChapter(URL_, f)).rejects.toMatchObject({ name: 'AbortError' });
  });
  test('capítulo de quadrinho → kind comic com as páginas em ordem', async () => {
    const imgs = Array.from({ length: 4 }, (_, i) => `<div data-page="${i}"><img src="/img/p0${i}.webp" alt="Page ${i + 1} - Chapter 5" data-page-index="${i}"></div>`).join('');
    const comicPage = `<html lang="en"><head><title>Série Chapter 5</title></head><body><header><img src="/logo.png" alt="logo"></header><main><h1>Série Chapter 5</h1>${imgs}</main></body></html>`;
    const r = await fetchChapter(URL_, resp(comicPage) as unknown as typeof fetch);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.item.kind).toBe('comic');
      expect(r.item.images).toEqual([0, 1, 2, 3].map((i) => `https://site.example/img/p0${i}.webp`));
    }
  });
});
