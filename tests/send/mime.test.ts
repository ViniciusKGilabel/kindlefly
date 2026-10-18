import { describe, expect, test } from 'vitest';
import { estimateMimeBytes } from '../../src/send/batch';
import { buildMimeMessage, encodeFilenameRfc2231 } from '../../src/send/mime';

describe('encodeFilenameRfc2231', () => {
  test('ASCII puro', () => {
    expect(encodeFilenameRfc2231('book.epub')).toBe('filename="book.epub"');
  });
  test('não-ASCII', () => {
    expect(encodeFilenameRfc2231('ação 📚.epub')).toBe(
      "filename*=UTF-8''a%C3%A7%C3%A3o%20%F0%9F%93%9A.epub",
    );
  });
});

describe('buildMimeMessage', () => {
  const data = new Uint8Array(1000).map((_, i) => i % 256);
  const msg = buildMimeMessage({
    from: 'a@gmail.com',
    to: 'b@kindle.com',
    subject: 'Olá',
    attachments: [{ filename: 'x.epub', data }],
    boundary: 'BND',
  });
  test('CRLF, boundary fixo, anexo base64 decodifica para os bytes originais', () => {
    expect(msg).toContain('From: a@gmail.com\r\n');
    expect(msg).toContain('To: b@kindle.com\r\n');
    expect(msg).toContain('MIME-Version: 1.0\r\n');
    expect(msg).toContain('Content-Type: multipart/mixed; boundary="BND"\r\n');
    expect(msg).toContain('Content-Type: application/epub+zip; name="x.epub"\r\n');
    expect(msg).toContain('Content-Transfer-Encoding: base64\r\n');
    expect(msg.endsWith('--BND--\r\n')).toBe(true);
    expect(msg.replace(/\r\n/g, '')).not.toContain('\n');
    const part = msg.split('--BND\r\n')[2]!;
    const b64 = part.split('\r\n\r\n')[1]!.replace(/--BND--\r\n$/, '');
    for (const l of b64.split('\r\n').filter(Boolean)) expect(l.length).toBeLessThanOrEqual(76);
    const back = Uint8Array.from(Buffer.from(b64.replace(/\r\n/g, ''), 'base64'));
    expect(back).toEqual(data);
  });
  test('assunto não-ASCII vira encoded-word', () => {
    expect(msg).toContain(`Subject: =?UTF-8?B?${Buffer.from('Olá').toString('base64')}?=\r\n`);
  });
  test('assunto ASCII fica puro; multi-MB não estoura a pilha', () => {
    const big = new Uint8Array(5 * 1024 * 1024);
    const m = buildMimeMessage({
      from: 'a@g.com', to: 'b@kindle.com', subject: 'Hi',
      attachments: [{ filename: 'b.epub', data: big }],
    });
    expect(m).toContain('Subject: Hi\r\n');
    expect(m.length).toBeGreaterThan(6_000_000);
  });
});

describe('linhas longas', () => {
  const longName = '📚'.repeat(120) + '.epub';
  const data = new Uint8Array(1000);
  test('nome com 120 emoji: toda linha ≤ 998 e continuações decodificam', () => {
    const m = buildMimeMessage({ from: 'a@g.com', to: 'b@kindle.com', subject: 'x', attachments: [{ filename: longName, data }], boundary: 'B' });
    for (const l of m.split('\r\n')) expect(l.length).toBeLessThanOrEqual(998);
    const unfolded = m.replace(/;\r\n /g, ';');
    const parts = [...unfolded.matchAll(/Content-Disposition: attachment; (.*)\r\n/g)][0]![1]!;
    const enc = parts.split(';').map((p) => p.replace(/^filename\*\d+\*=(UTF-8'')?/, '')).join('');
    expect(decodeURIComponent(enc)).toBe(longName);
    expect(estimateMimeBytes(data.length)).toBeGreaterThanOrEqual(m.length);
  });
  test('assunto longo: encoded-words ≤ 75 e decodificam ao original', () => {
    const subj = 'Ação 📚 café '.repeat(20);
    const m = buildMimeMessage({ from: 'a@g.com', to: 'b@kindle.com', subject: subj, attachments: [], boundary: 'B' });
    const hdr = m.split('\r\nMIME-Version')[0]!.split('Subject: ')[1]!;
    const words = hdr.split('\r\n ');
    expect(words.length).toBeGreaterThan(1);
    for (const w of words) expect(w.length).toBeLessThanOrEqual(75);
    const dec = words.map((w) => Buffer.from(w.slice(10, -2), 'base64')).reduce((a, b) => Buffer.concat([a, b]));
    expect(dec.toString('utf8')).toBe(subj);
  });
});
