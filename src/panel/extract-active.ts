import { KfError } from '../core/errors';
import type { ExtractedItem } from '../core/types';

/** Extrai a aba ativa; qualquer falha (injeção bloqueada, sem resultado) vira extract_failed. */
export async function extractActiveTab(): Promise<Omit<ExtractedItem, 'id'>> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw new Error('no active tab');
    const results = await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/extract.js'] });
    const r = results[0]?.result as Omit<ExtractedItem, 'id'> | undefined;
    if (!r || typeof r.html !== 'string' || typeof r.title !== 'string') throw new Error('empty result');
    return r;
  } catch (e) {
    throw new KfError('extract_failed', e instanceof Error ? e.message : undefined);
  }
}

export function errorMessage(
  e: unknown,
  t: (k: string) => string,
): string {
  return e instanceof KfError ? t('error_' + e.code) : t('error_gmail_error');
}
