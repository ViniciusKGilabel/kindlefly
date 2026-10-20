import { describe, expect, test, vi } from 'vitest';
import { isKindleAddress, sendRawMessage, sendToKindle, sendWithRetry } from '../../src/send/gmail';
import { KfError } from '../../src/core/errors';

const ok = () => new Response('{}', { status: 200 });
function fakeAuth(email: string | null = 'me@gmail.com') {
  let n = 0;
  return {
    getToken: vi.fn(async () => `tok${++n}`),
    invalidate: vi.fn(async () => {}),
    connectedEmail: vi.fn(async () => email),
  };
}
const file = (name = 'a.epub', size = 100) => ({ filename: name, data: new Uint8Array(size) });
async function code(p: Promise<unknown>) {
  try { await p; } catch (e) { return e instanceof KfError ? e.code : 'other'; }
  return 'none';
}

test('isKindleAddress', () => {
  expect(isKindleAddress(' Foo@Kindle.com ')).toBe(true);
  expect(isKindleAddress('foo@gmail.com')).toBe(false);
  expect(isKindleAddress('foo@kindle.com.br')).toBe(false);
});

describe('sendToKindle', () => {
  test('endereço ausente/inválido; nada enviado', async () => {
    const fetchFn = vi.fn();
    const auth = fakeAuth();
    expect(await code(sendToKindle([file()], { auth, kindleAddress: null, fetchFn, subject: 's' }))).toBe('kindle_address_missing');
    expect(await code(sendToKindle([file()], { auth, kindleAddress: 'x@gmail.com', fetchFn, subject: 's' }))).toBe('kindle_address_invalid');
    expect(fetchFn).not.toHaveBeenCalled();
  });
  test('não conectado', async () => {
    const fetchFn = vi.fn();
    expect(await code(sendToKindle([file()], { auth: fakeAuth(null), kindleAddress: 'a@kindle.com', fetchFn, subject: 's' }))).toBe('not_connected');
    expect(fetchFn).not.toHaveBeenCalled();
  });
  test('POST com Bearer e message/rfc822', async () => {
    const fetchFn = vi.fn(async () => ok());
    const r = await sendToKindle([file()], { auth: fakeAuth(), kindleAddress: ' A@Kindle.com ', fetchFn, subject: 'Olá' });
    expect(r).toEqual({ emailsSent: 1, tooLarge: [] });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media');
    expect(init.method).toBe('POST');
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer tok1');
    expect(h['Content-Type']).toBe('message/rfc822');
    expect(String(init.body)).toContain('To: a@kindle.com\r\n');
    expect(String(init.body)).toContain('From: me@gmail.com\r\n');
  });
  test('grandes demais voltam em tooLarge; outros enviados', async () => {
    const fetchFn = vi.fn(async () => ok());
    const r = await sendToKindle([file('big.epub', 26 * 1024 * 1024), file('s.epub')], { auth: fakeAuth(), kindleAddress: 'a@kindle.com', fetchFn, subject: 's' });
    expect(r).toEqual({ emailsSent: 1, tooLarge: ['big.epub'] });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  test('todos grandes: não chama Gmail', async () => {
    const fetchFn = vi.fn();
    const r = await sendToKindle([file('big.epub', 26 * 1024 * 1024)], { auth: fakeAuth(), kindleAddress: 'a@kindle.com', fetchFn, subject: 's' });
    expect(r).toEqual({ emailsSent: 0, tooLarge: ['big.epub'] });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('sendRawMessage', () => {
  test('401 uma vez → invalida, renova, reenvia', async () => {
    const auth = fakeAuth();
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 })).mockResolvedValueOnce(ok());
    await sendWithRetry('raw', auth, fetchFn);
    expect(auth.invalidate).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect((fetchFn.mock.calls[1]![1].headers as Record<string, string>).Authorization).toBe('Bearer tok2');
  });
  test('401 duas vezes → gmail_error com status', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 401 }));
    await expect(sendWithRetry('raw', fakeAuth(), fetchFn)).rejects.toMatchObject({ code: 'gmail_error', message: expect.stringContaining('401'), status: 401 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  test('500 → gmail_error', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 500 }));
    await expect(sendWithRetry('raw', fakeAuth(), fetchFn)).rejects.toMatchObject({ code: 'gmail_error' });
  });
  test('fetch rejeita → network', async () => {
    const fetchFn = vi.fn(async () => { throw new TypeError('x'); });
    expect(await code(sendRawMessage('raw', 't', fetchFn))).toBe('network');
  });
});

describe('sendToKindle: ritmo e progresso', () => {
  const big = () => Array.from({ length: 3 }, (_, i) => file(`f${i}.epub`, 10 * 1024 * 1024));
  test('sleep 5000 entre e-mails (2 vezes para 3) e progresso', async () => {
    const sleep = vi.fn(async () => {});
    const onProgress = vi.fn();
    const r = await sendToKindle(big(), { auth: fakeAuth(), kindleAddress: 'a@kindle.com', fetchFn: vi.fn(async () => ok()), subject: 's', sleep, onProgress });
    expect(r.emailsSent).toBe(3);
    expect(sleep.mock.calls).toEqual([[5000], [5000]]);
    expect(onProgress.mock.calls).toEqual([[1, 3], [2, 3], [3, 3]]);
  });
  test('um e-mail: sem sleep', async () => {
    const sleep = vi.fn(async () => {});
    await sendToKindle([file()], { auth: fakeAuth(), kindleAddress: 'a@kindle.com', fetchFn: vi.fn(async () => ok()), subject: 's', sleep });
    expect(sleep).not.toHaveBeenCalled();
  });
});
