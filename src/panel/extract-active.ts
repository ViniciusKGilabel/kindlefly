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
  if (e instanceof KfError) {
    // message = código + detalhe (status/erro do Google); nunca contém tokens nem corpo de mensagem.
    console.warn('[kindlefly]', e.code, e.message);
    const text = t('error_' + e.code);
    return e.code === 'gmail_error' && e.status !== undefined ? `${text} (HTTP ${e.status})` : text;
  }
  console.warn('[kindlefly]', 'unexpected', e instanceof Error ? e.message : String(e));
  return t('error_gmail_error');
}
