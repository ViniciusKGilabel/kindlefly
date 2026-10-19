import { afterEach, describe, expect, test, vi } from 'vitest';
import { KfError, type ErrorCode } from '../../src/core/errors';
import { errorMessage, isRestrictedUrl } from '../../src/panel/extract-active';

const t = (k: string) => `[${k}]`;
afterEach(() => vi.restoreAllMocks());

test('KfError vira a mensagem localizada e registra código + detalhe', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(errorMessage(new KfError('extract_failed', 'no active tab'), t)).toBe('[error_extract_failed]');
  expect(warn).toHaveBeenCalledWith('[kindlefly]', 'extract_failed', 'extract_failed: no active tab');
});

test('gmail_error acrescenta o status HTTP', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(errorMessage(new KfError('gmail_error', 'status 403', 403), t)).toBe('[error_gmail_error] (HTTP 403)');
});

test('gmail_error sem status não acrescenta nada', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(errorMessage(new KfError('gmail_error'), t)).toBe('[error_gmail_error]');
});

describe('avisos no console', () => {
  const silent: ErrorCode[] = [
    'restricted_page', 'kindle_address_missing', 'kindle_address_invalid',
    'not_connected', 'auth_cancelled', 'scope_missing', 'too_large',
  ];
  test.each(silent)('%s não chama console.warn', (code) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(errorMessage(new KfError(code), t)).toBe(`[error_${code}]`);
    expect(warn).not.toHaveBeenCalled();
  });
  test.each(['gmail_error', 'network', 'auth_failed', 'extract_failed'] as ErrorCode[])('%s chama console.warn', (code) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorMessage(new KfError(code), t);
    expect(warn).toHaveBeenCalled();
  });
  test('erro não-KfError chama console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorMessage(new Error('x'), t);
    expect(warn).toHaveBeenCalled();
  });
});

describe('isRestrictedUrl', () => {
  test.each([
    'chrome://extensions', 'chrome-extension://abc/page.html', 'edge://settings', 'about:blank',
    'view-source:https://a.com', 'devtools://devtools/x', 'chrome-search://local-ntp',
    'https://chromewebstore.google.com/detail/x', 'https://chrome.google.com/webstore/detail/x',
    'https://chrome.google.com/webstore',
  ])('%s é restrita', (u) => expect(isRestrictedUrl(u)).toBe(true));
  test('undefined é restrita', () => expect(isRestrictedUrl(undefined)).toBe(true));
  test.each(['https://exemplo.com', 'https://chrome.google.com/other', 'http://a.com/webstore'])('%s não é', (u) =>
    expect(isRestrictedUrl(u)).toBe(false));
});
