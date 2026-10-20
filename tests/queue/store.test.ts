import { expect, test } from 'vitest';
import { addItem } from '../../src/queue/queue';
import { loadQueue, saveQueue } from '../../src/queue/store';
import type { KvStorage } from '../../src/settings/store';

function fake(initial: Record<string, unknown> = {}): KvStorage {
  const data = { ...initial };
  return {
    async get(key) { return key in data ? { [key]: data[key] } : {}; },
    async set(items) { Object.assign(data, items); },
  };
}

test('round-trip', async () => {
  const s = fake();
  const q = addItem([], { sourceUrl: 'u', title: 'T', author: 'A', language: 'en', html: '<p>x</p>', kind: 'article' }, 5, 'id').queue;
  await saveQueue(q, s);
  expect(await loadQueue(s)).toEqual(q);
});

test('ausente → []', async () => {
  expect(await loadQueue(fake())).toEqual([]);
});

test('corrompido → []', async () => {
  expect(await loadQueue(fake({ 'kf.queue': 'lixo' }))).toEqual([]);
  expect(await loadQueue(fake({ 'kf.queue': [{ foo: 1 }, null] }))).toEqual([]);
});

test('item merged com parts sobrevive ao load', async () => {
  const s = fake();
  const q = [{ id: 'm', sourceUrl: 'merged:m', title: 'T', author: 'A', language: 'en', html: '', kind: 'merged' as const,
    parts: [{ title: 'c', html: '<p>x</p>', sourceUrl: 'u' }], selected: true, addedAt: 1 }];
  await saveQueue(q, s);
  expect(await loadQueue(s)).toEqual(q);
});
test('parts malformadas → item descartado', async () => {
  const bad = { id: 'm', sourceUrl: 'merged:m', title: 'T', author: 'A', language: 'en', html: '', kind: 'merged', parts: [{ title: 1 }], selected: true, addedAt: 1 };
  expect(await loadQueue(fake({ 'kf.queue': [bad] }))).toEqual([]);
});

test('merged sem parts ou com parts vazio → descartado', async () => {
  const base = { id: 'm', sourceUrl: 'merged:m', title: 'T', author: 'A', language: 'en', html: '', kind: 'merged', selected: true, addedAt: 1 };
  expect(await loadQueue(fake({ 'kf.queue': [base, { ...base, parts: [] }] }))).toEqual([]);
});
