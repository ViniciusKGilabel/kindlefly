import { KfError } from '../core/errors';
import { isKindleAddress } from '../send/gmail';

const KEY = 'kf.kindleAddress';

export interface KvStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

async function defaultStorage(): Promise<KvStorage> {
  const { browser } = await import('wxt/browser');
  return browser.storage.local as unknown as KvStorage;
}

export async function getKindleAddress(storage?: KvStorage): Promise<string | null> {
  const s = storage ?? (await defaultStorage());
  const v = (await s.get(KEY))[KEY];
  return typeof v === 'string' && v ? v : null;
}

export async function setKindleAddress(v: string, storage?: KvStorage): Promise<void> {
  const n = v.trim().toLowerCase();
  if (!isKindleAddress(n)) throw new KfError('kindle_address_invalid');
  const s = storage ?? (await defaultStorage());
  await s.set({ [KEY]: n });
}
