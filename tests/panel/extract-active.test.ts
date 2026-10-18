import { afterEach, expect, test, vi } from 'vitest';
import { KfError } from '../../src/core/errors';
import { errorMessage } from '../../src/panel/extract-active';

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
