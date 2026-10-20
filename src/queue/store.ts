import type { KvStorage } from '../settings/store';
import type { QueueItem } from './queue';

const KEY = 'kf.queue';

async function defaultStorage(): Promise<KvStorage> {
  const { browser } = await import('wxt/browser');
  return browser.storage.local as unknown as KvStorage;
}

const isUrlList = (v: unknown): boolean => Array.isArray(v) && v.every((u) => typeof u === 'string');

function isPart(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return typeof o.title === 'string' && typeof o.html === 'string' && typeof o.sourceUrl === 'string' && (o.images === undefined || isUrlList(o.images));
}

function isItem(x: unknown): x is QueueItem {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.sourceUrl === 'string' &&
    typeof o.title === 'string' &&
    typeof o.author === 'string' &&
    typeof o.language === 'string' &&
    typeof o.html === 'string' &&
    typeof o.selected === 'boolean' &&
    typeof o.addedAt === 'number' &&
    (o.parts === undefined || (Array.isArray(o.parts) && o.parts.every(isPart))) &&
    (o.images === undefined || isUrlList(o.images)) &&
    (o.kind !== 'comic' || (isUrlList(o.images) && (o.images as unknown[]).length > 0)) &&
    (o.kind !== 'merged' || (Array.isArray(o.parts) && o.parts.length > 0))
  );
}

/** Valor ausente ou corrompido → lista vazia (itens inválidos são descartados). */
export async function loadQueue(storage?: KvStorage): Promise<QueueItem[]> {
  try {
    const s = storage ?? (await defaultStorage());
    const v = (await s.get(KEY))[KEY];
    return Array.isArray(v) ? v.filter(isItem) : [];
  } catch {
    return [];
  }
}

export async function saveQueue(q: QueueItem[], storage?: KvStorage): Promise<void> {
  const s = storage ?? (await defaultStorage());
  await s.set({ [KEY]: q });
}
