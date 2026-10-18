import type { EpubFile } from '../core/types';

export function encodeFilenameRfc2231(name: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(name) && !/["\\]/.test(name)) return `filename="${name}"`;
  const enc = encodeURIComponent(name).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return `filename*=UTF-8''${enc}`;
}

export function bytesToBase64(data: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < data.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, data.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(bin);
}

function wrap76(s: string): string {
  const lines: string[] = [];
  for (let i = 0; i < s.length; i += 76) lines.push(s.slice(i, i + 76));
  return lines.join('\r\n');
}

function encodeWord(s: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  return `=?UTF-8?B?${bytesToBase64(new TextEncoder().encode(s))}?=`;
}

export function buildMimeMessage(m: {
  from: string;
  to: string;
  subject: string;
  attachments: EpubFile[];
  boundary?: string;
}): string {
  const b = m.boundary ?? `kf_${crypto.randomUUID().replace(/-/g, '')}`;
  const out: string[] = [
    `From: ${m.from}`,
    `To: ${m.to}`,
    `Subject: ${encodeWord(m.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${b}"`,
    '',
    `--${b}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(bytesToBase64(new TextEncoder().encode('Enviado pelo kindlefly'))),
  ];
  for (const a of m.attachments) {
    const fn = encodeFilenameRfc2231(a.filename);
    out.push(
      `--${b}`,
      `Content-Type: application/epub+zip; ${fn.replace('filename', 'name')}`,
      `Content-Disposition: attachment; ${fn}`,
      'Content-Transfer-Encoding: base64',
      '',
      wrap76(bytesToBase64(a.data)),
    );
  }
  out.push(`--${b}--`, '');
  return out.join('\r\n');
}
