import type { ExtractedItem } from '../core/types';
import { extractFromDocument } from '../extract/readability';

export type ChapterResult =
  | { ok: true; item: Omit<ExtractedItem, 'id'> }
  | { ok: false; reason: 'http' | 'network' | 'extract'; status?: number };

function isAbort(e: unknown): boolean {
  return (e as { name?: string } | null)?.name === 'AbortError';
}

/** Busca um capítulo em segundo plano e extrai o texto. AbortError propaga. */
export async function fetchChapter(url: string, fetchFn: typeof fetch, signal?: AbortSignal): Promise<ChapterResult> {
  let html: string;
  let baseUrl = url;
  try {
    const res = await fetchFn(url, { signal, credentials: 'include' });
    if (!res.ok) return { ok: false, reason: 'http', status: res.status };
    html = await res.text();
    baseUrl = res.url || url;
  } catch (e) {
    if (isAbort(e)) throw e;
    return { ok: false, reason: 'network' };
  }
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const base = doc.createElement('base');
    base.setAttribute('href', baseUrl);
    doc.head.prepend(base);
    return { ok: true, item: extractFromDocument(doc, url) };
  } catch {
    return { ok: false, reason: 'extract' };
  }
}
