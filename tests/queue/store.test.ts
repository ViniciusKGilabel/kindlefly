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
