import { readFileSync, existsSync } from 'node:fs';
import { createPublicKey } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { extensionIdFromPublicKey } from '../../scripts/extension-id.mjs';

const root = resolve(__dirname, '../..');
const configKey = /key:\s*'([A-Za-z0-9+/=]+)'/.exec(readFileSync(resolve(root, 'wxt.config.ts'), 'utf8'))?.[1];

// ID impresso por `node scripts/gen-key.mjs` para a chave embutida no wxt.config.ts
const EXPECTED_ID = 'mldnanjggjdhajchcgldihldickkjfee';

describe('ID fixo da extensão', () => {
  test('o wxt.config.ts contém a chave pública', () => {
    expect(configKey).toBeTruthy();
  });

  test('o ID calculado da chave do config é o impresso pelo gen-key', () => {
    expect(extensionIdFromPublicKey(configKey!)).toBe(EXPECTED_ID);
    expect(EXPECTED_ID).toMatch(/^[a-p]{32}$/);
  });

  test.skipIf(!existsSync(resolve(root, 'keys/kindlefly.pem')))(
    'a chave do config corresponde ao keys/kindlefly.pem local',
    () => {
      const pem = readFileSync(resolve(root, 'keys/kindlefly.pem'));
      const der = createPublicKey(pem).export({ type: 'spki', format: 'der' }).toString('base64');
      expect(der).toBe(configKey);
    },
  );
});
