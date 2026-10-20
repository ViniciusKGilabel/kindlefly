import { describe, expect, test } from 'vitest';
import { fetchImageBlob } from '../../src/images/fetch-image';
import { IMAGE_MAX_BYTES } from '../../src/images/layout';

const resp = (body: BodyInit, init: ResponseInit = {}) => (async () => new Response(body, init)) as unknown as typeof fetch;

describe('fetchImageBlob', () => {
  test('ok', async () => {
    const f = resp('abc', { headers: { 'content-type': 'image/png' } });
    const b = await fetchImageBlob('https://x/a.png', f);
    expect(b.size).toBe(3);
  });
  test('404', async () => {
    await expect(fetchImageBlob('https://x/a.png', resp('', { status: 404 }))).rejects.toMatchObject({ code: 'image_failed' });
  });
  test('text/html', async () => {
    const f = resp('<html>', { headers: { 'content-type': 'text/html' } });
    await expect(fetchImageBlob('https://x/a.png', f)).rejects.toMatchObject({ code: 'image_failed' });
  });
  test('sem content-type: extensão conhecida passa, desconhecida falha', async () => {
    const mk = () => (async () => { const r = new Response('abc'); r.headers.delete('content-type'); return r; }) as unknown as typeof fetch;
    expect((await fetchImageBlob('https://x/a.jpg?x=1', mk())).size).toBe(3);
    await expect(fetchImageBlob('https://x/page', mk())).rejects.toMatchObject({ code: 'image_failed' });
  });
  test('Content-Length grande', async () => {
    const f = resp('abc', { headers: { 'content-type': 'image/png', 'content-length': String(IMAGE_MAX_BYTES + 1) } });
    await expect(fetchImageBlob('https://x/a.png', f)).rejects.toMatchObject({ code: 'image_failed' });
  });
  test('blob grande sem Content-Length', async () => {
    const f = resp(new Uint8Array(IMAGE_MAX_BYTES + 1), { headers: { 'content-type': 'image/png' } });
    await expect(fetchImageBlob('https://x/a.png', f)).rejects.toMatchObject({ code: 'image_failed' });
  });
  test('AbortError propaga e opções corretas', async () => {
    let seen: RequestInit | undefined;
    const f = (async (_u: string, init?: RequestInit) => { seen = init; throw new DOMException('x', 'AbortError'); }) as unknown as typeof fetch;
    const ac = new AbortController();
    await expect(fetchImageBlob('https://x/a.png', f, ac.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(seen).toMatchObject({ signal: ac.signal, credentials: 'omit' });
  });
});
