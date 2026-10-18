import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { ALL_ERROR_CODES } from '../../src/core/errors';

const readJson = (p: string): Record<string, { message: string }> =>
  JSON.parse(readFileSync(resolve(__dirname, '../..', p), 'utf8'));
const keys = (l: string) => Object.keys(readJson(`public/_locales/${l}/messages.json`)).sort();

describe('locales', () => {
  test('os três locales têm exatamente as mesmas chaves', () => {
    expect(keys('pt_BR')).toEqual(keys('en'));
    expect(keys('es')).toEqual(keys('en'));
  });

  test('toda chave error_<code> existe para cada ErrorCode', () => {
    for (const code of ALL_ERROR_CODES) expect(keys('en')).toContain(`error_${code}`);
  });

  test('toda mensagem tem texto não vazio', () => {
    for (const l of ['pt_BR', 'en', 'es'])
      for (const [k, v] of Object.entries(readJson(`public/_locales/${l}/messages.json`)))
        expect(v.message, `${l}.${k}`).not.toBe('');
  });
});
