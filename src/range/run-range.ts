import type { ExtractedItem } from '../core/types';
import { chapterUrl, type ChapterUrl } from './chapter-url';
import type { ChapterResult } from './fetch-chapter';

export const RANGE_DELAY_MS = 1000;

const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === 'AbortError';

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done);
  });
}

export async function runRange(o: {
  chapter: ChapterUrl;
  from: number;
  to: number;
  fetchChapter: (url: string, signal?: AbortSignal) => Promise<ChapterResult>;
  onItem: (item: Omit<ExtractedItem, 'id'>) => 'added' | 'duplicate';
  onProgress?: (done: number, total: number) => void;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
}): Promise<{ added: number; duplicates: number; failed: number[]; cancelled: boolean }> {
  const sleep = o.sleep ?? abortableSleep;
  const total = o.to - o.from + 1;
  const r = { added: 0, duplicates: 0, failed: [] as number[], cancelled: false };
  for (let n = o.from; n <= o.to; n++) {
    const i = n - o.from;
    if (o.signal?.aborted) { r.cancelled = true; break; }
    if (i > 0) {
      await sleep(RANGE_DELAY_MS, o.signal);
      if (o.signal?.aborted) { r.cancelled = true; break; }
    }
    o.onProgress?.(i, total);
    try {
      const res = await o.fetchChapter(chapterUrl(o.chapter, n), o.signal);
      if (res.ok) {
        if (o.onItem(res.item) === 'added') r.added++;
        else r.duplicates++;
      } else r.failed.push(n);
    } catch (e) {
      if (isAbort(e) || o.signal?.aborted) { r.cancelled = true; break; }
      r.failed.push(n);
    }
  }
  if (!r.cancelled) o.onProgress?.(total, total);
  return r;
}
