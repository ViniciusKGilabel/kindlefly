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
  const enc = new TextEncoder();
  const words: string[] = [];
  let cur: string[] = [];
  let curBytes = 0;
  const flush = () => {
    if (cur.length) words.push(`=?UTF-8?B?${bytesToBase64(enc.encode(cur.join('')))}?=`);
    cur = [];
    curBytes = 0;
  };
  for (const ch of s) {
    const n = enc.encode(ch).length;
    if (curBytes + n > 45) flush(); // 45 bytes -> 60 base64 chars -> word of 72
    cur.push(ch);
    curBytes += n;
  }
  flush();
  return words.join('\r\n ');
}

const MAX_SINGLE_PARAM = 70;
const CHUNK = 60;

/** Parameter (`filename` or `name`) folded with RFC 2231 continuations when long. */
function foldedParam(name: string, param: 'filename' | 'name'): string {
  const single = encodeFilenameRfc2231(name).replace(/^filename/, param);
  if (single.length <= MAX_SINGLE_PARAM || !single.startsWith(`${param}*=`)) return single;
  const enc = single.slice(`${param}*=UTF-8''`.length);
  const chunks: string[] = [];
  let cur = '';
  for (const tok of enc.match(/%[0-9A-F]{2}|[^%]/g) ?? []) {
    if (cur.length + tok.length > CHUNK) {
      chunks.push(cur);
      cur = '';
    }
    cur += tok;
  }
  if (cur) chunks.push(cur);
  return chunks
    .map((c, i) => `${param}*${i}*=${i === 0 ? "UTF-8''" : ''}${c}`)
    .join(';\r\n ');
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
    out.push(
      `--${b}`,
      `Content-Type: application/epub+zip; ${foldedParam(a.filename, 'name')}`,
      `Content-Disposition: attachment; ${foldedParam(a.filename, 'filename')}`,
      'Content-Transfer-Encoding: base64',
      '',
      wrap76(bytesToBase64(a.data)),
    );
  }
  out.push(`--${b}--`, '');
  return out.join('\r\n');
}
