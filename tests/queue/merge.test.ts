import { expect, test } from 'vitest';
import { mergeItems, mergeTitle } from '../../src/queue/merge';
import type { QueueItem } from '../../src/queue/queue';

const mk = (id: string, title: string, o: Partial<QueueItem> = {}): QueueItem => ({
  id, sourceUrl: 'https://x/' + id, title, author: 'A-' + id, language: 'en-' + id,
  html: `<p>${id}</p>`, kind: 'article', selected: true, addedAt: 1, ...o,
});

test('mergeTitle: intervalo', () => {
  expect(mergeTitle(['Shadow Slave Chapter 450', 'Shadow Slave Chapter 460', 'Shadow Slave Chapter 455']))
    .toBe('Shadow Slave Chapter 450–460');
  expect(mergeTitle(['Cap 1 (pt)', 'Cap 3 (pt)'])).toBe('Cap 1–3 (pt)');
});
test('mergeTitle: um só número, sem número, prefixos diferentes', () => {
  expect(mergeTitle(['Chapter 5', 'Chapter 5'])).toBe('Chapter 5');
  expect(mergeTitle(['Intro', 'Fim', 'Meio'])).toBe('Intro (+2)');
  expect(mergeTitle(['A 1', 'B 2'])).toBe('A 1 (+1)');
});
test('mergeItems: ordem da lista, campos do primeiro', () => {
  const m = mergeItems([mk('a', 'Ch 1'), mk('b', 'Ch 2')], 'm1', 9);
  expect(m).toMatchObject({
    id: 'm1', kind: 'merged', html: '', sourceUrl: 'merged:m1', author: 'A-a', language: 'en-a',
    title: 'Ch 1–2', selected: true, addedAt: 9,
  });
  expect(m.parts).toEqual([
    { title: 'Ch 1', html: '<p>a</p>', sourceUrl: 'https://x/a' },
    { title: 'Ch 2', html: '<p>b</p>', sourceUrl: 'https://x/b' },
  ]);
});
test('mergeItems: expande merged', () => {
  const m1 = mergeItems([mk('a', 'Ch 1'), mk('b', 'Ch 2')], 'm1', 1);
  const m2 = mergeItems([m1, mk('c', 'Ch 3')], 'm2', 2);
  expect(m2.parts!.map((p) => p.title)).toEqual(['Ch 1', 'Ch 2', 'Ch 3']);
  expect(m2.title).toBe('Ch 1–3');
});
