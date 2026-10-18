import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extensionIdFromPublicKey } from './extension-id.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pemPath = resolve(root, 'keys/kindlefly.pem');

let privatePem;
if (existsSync(pemPath)) {
  privatePem = readFileSync(pemPath);
  console.log(`Chave existente mantida: ${pemPath}`);
} else {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  mkdirSync(dirname(pemPath), { recursive: true });
  writeFileSync(pemPath, privatePem, { mode: 0o600 });
  console.log(`Chave gerada: ${pemPath}`);
}

const publicDer = createPublicKey(privatePem).export({ type: 'spki', format: 'der' }).toString('base64');
console.log(`\nmanifest.key (chave pública DER base64):\n${publicDer}`);
console.log(`\nID da extensão:\n${extensionIdFromPublicKey(publicDer)}`);
