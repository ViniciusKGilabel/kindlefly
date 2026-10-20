import { describe, expect, test } from 'vitest';
import { chapterUrl, parseChapterUrl } from '../../src/range/chapter-url';
import type { ChapterResult } from '../../src/range/fetch-chapter';
import { runRange } from '../../src/range/run-range';

const ch = parseChapterUrl('https://s.example/c/450')!;
const okItem = (url: string): ChapterResult => ({
  ok: true,
  item: { sourceUrl: url, title: url, author: 'a', language: 'en', html: '<p>x</p>', kind: 'article' },
});

function setup(failing: number[] = [], dup: number[] = []) {
  const calls: string[] = [];
  const sleeps: number[] = [];
  return {
    calls,
    sleeps,
    opts: {
      chapter: ch,
      fetchChapter: async (url: string) => {
        calls.push(url);
        const n = Number(url.split('/').pop());
        return failing.includes(n) ? ({ ok: false, reason: 'http', status: 404 } as ChapterResult) : okItem(url);
      },
      onItem: (i: { sourceUrl: string }) => (dup.includes(Number(i.sourceUrl.split('/').pop())) ? ('duplicate' as const) : ('added' as const)),
      sleep: async (ms: number) => { sleeps.push(ms); },
    },
  };
}

describe('runRange', () => {
  test('450..453 com 452 falhando', async () => {
    const s = setup([452]);
    const r = await runRange({ ...s.opts, from: 450, to: 453 });
    expect(r).toEqual({ added: 3, duplicates: 0, failed: [452], cancelled: false });
    expect(s.calls).toEqual([450, 451, 452, 453].map((n) => chapterUrl(ch, n)));
    expect(s.sleeps).toEqual([1000, 1000, 1000]);
  });
  test('duplicado contado', async () => {
    const s = setup([], [451]);
    const r = await runRange({ ...s.opts, from: 450, to: 452 });
    expect(r).toMatchObject({ added: 2, duplicates: 1, failed: [] });
  });
  test('onProgress (i, total)', async () => {
    const s = setup();
    const p: Array<[number, number]> = [];
    await runRange({ ...s.opts, from: 450, to: 452, onProgress: (d, t) => p.push([d, t]) });
    expect(p).toEqual([[0, 3], [1, 3], [2, 3], [3, 3]]);
  });
  test('cancelar no meio devolve parcial', async () => {
    const s = setup();
    const ac = new AbortController();
    const r = await runRange({
      ...s.opts,
      from: 450,
      to: 455,
      signal: ac.signal,
      onItem: (i) => {
        if (i.sourceUrl.endsWith('451')) ac.abort();
        return 'added';
      },
    });
    expect(r.cancelled).toBe(true);
    expect(r.added).toBe(2);
    expect(s.calls.length).toBe(2);
  });
  test('AbortError do fetch → cancelado', async () => {
    const s = setup();
    const r = await runRange({
      ...s.opts,
      from: 450,
      to: 452,
      fetchChapter: async () => { throw new DOMException('x', 'AbortError'); },
    });
    expect(r).toEqual({ added: 0, duplicates: 0, failed: [], cancelled: true });
  });
});
