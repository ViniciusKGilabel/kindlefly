import { KfError, type ErrorCode } from '../core/errors';
import type { ExtractedItem } from '../core/types';

const RESTRICTED_PREFIXES = [
  'chrome://', 'chrome-extension://', 'edge://', 'about:', 'view-source:', 'devtools://', 'chrome-search://',
];

/** Páginas onde o Chrome não permite injetar script (ou sem URL conhecida). */
export function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  if (RESTRICTED_PREFIXES.some((p) => lower.startsWith(p))) return true;
  try {
    const u = new URL(url);
    if (u.host === 'chromewebstore.google.com') return true;
    if (u.host === 'chrome.google.com' && (u.pathname === '/webstore' || u.pathname.startsWith('/webstore/'))) return true;
  } catch {
    return true;
  }
  return false;
}

/** Extrai a aba ativa; páginas proibidas → restricted_page; outras falhas viram extract_failed. */
export async function extractActiveTab(): Promise<Omit<ExtractedItem, 'id'>> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw new Error('no active tab');
    if (isRestrictedUrl(tab.url)) throw new KfError('restricted_page');
    const results = await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/extract.js'] });
    const r = results[0]?.result as Omit<ExtractedItem, 'id'> | undefined;
    if (!r || typeof r.html !== 'string' || typeof r.title !== 'string') throw new Error('empty result');
    return r;
  } catch (e) {
    if (e instanceof KfError) throw e;
    throw new KfError('extract_failed', e instanceof Error ? e.message : undefined);
  }
}

/** Só falhas inesperadas vão ao console; estados esperados (config faltando, cancelamento) ficam silenciosos. */
const WARN_CODES: ReadonlySet<ErrorCode> = new Set(['gmail_error', 'network', 'auth_failed', 'extract_failed']);

export function errorMessage(
  e: unknown,
  t: (k: string) => string,
): string {
  if (e instanceof KfError) {
    // message = código + detalhe (status/erro do Google); nunca contém tokens nem corpo de mensagem.
    if (WARN_CODES.has(e.code)) console.warn('[kindlefly]', e.code, e.message);
    const text = t('error_' + e.code);
    return e.code === 'gmail_error' && e.status !== undefined ? `${text} (HTTP ${e.status})` : text;
  }
  console.warn('[kindlefly]', 'unexpected', e instanceof Error ? e.message : String(e));
  return t('error_gmail_error');
}

/** URL da aba ativa (para reconhecer números de capítulo); undefined se indisponível. */
export async function activeTabUrl(): Promise<string | undefined> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab?.url;
  } catch {
    return undefined;
  }
}
