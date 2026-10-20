import { createHash } from 'node:crypto';

/** ID da extensão Chrome: SHA-256 da chave pública DER, 32 primeiros hex mapeados 0-f → a-p. */
export function extensionIdFromPublicKey(publicKeyDerBase64) {
  const hex = createHash('sha256').update(Buffer.from(publicKeyDerBase64, 'base64')).digest('hex');
  return [...hex.slice(0, 32)].map((c) => String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16))).join('');
}
