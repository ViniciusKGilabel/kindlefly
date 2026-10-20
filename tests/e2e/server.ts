import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface Fixtures {
  smallPng: Buffer; // 400×300 com transparência
  photoJpg: Buffer; // 2400×1600
  stripWebp: Buffer; // 900×16000, faixas brancas em y=1100 e y=2250
  pagePng: Buffer; // 900×1200
  logoPng: Buffer;
}

const para = (i: number) =>
  `<p>Parágrafo ${i} do artigo, uma frase longa com palavras suficientes, vírgulas, orações e conteúdo para satisfazer as heurísticas de legibilidade com segurança.</p>`;

const articleHtml = `<!doctype html><html lang="pt-BR"><head><title>Artigo com Imagens - Leia Online</title></head><body><nav>menu</nav><article><h1>Artigo com Imagens</h1>${para(1)}<img src="/img/small.png" alt="Figura um">${para(2)}<figure><img data-src="/img/photo.jpg" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="lazy"><figcaption>Legenda</figcaption></figure>${para(3)}<img src="/img/missing.png" alt="sumiu">${para(4)}${para(5)}</article></body></html>`;

const comicHtml = (n: string) =>
  `<!doctype html><html lang="en"><head><title>Test Comic Chapter ${n} - Read Online | Comic Site</title><meta property="og:site_name" content="Comic Site"></head><body><header><img src="/img/logo.png" alt="logo"></header><main><h1>Chapter ${n}</h1><div class="reader">${[
    ['page.png', 0],
    ['strip.webp', 1],
    ['page.png', 2],
  ]
    .map(
      ([f, i]) =>
        `<div data-page="${i}"><img src="/img/${f}?c=${n}&p=${i}" alt="Page ${Number(i) + 1} - Chapter ${n}" data-page-index="${i}"></div>`,
    )
    .join('')}</div><p>Comments: nice chapter.</p></main></body></html>`;

export async function startServer(f: Fixtures): Promise<{ origin: string; close: () => Promise<void> }> {
  const srv = http.createServer((q, r) => {
    const u = (q.url ?? '').split('?')[0] ?? '';
    const send = (type: string, body: Buffer | string) => {
      r.setHeader('content-type', type);
      r.end(body);
    };
    if (u === '/article') return send('text/html; charset=utf-8', articleHtml);
    if (u === '/img/small.png') return send('image/png', f.smallPng);
    if (u === '/img/photo.jpg') return send('image/jpeg', f.photoJpg);
    if (u === '/img/strip.webp') return send('image/webp', f.stripWebp);
    if (u === '/img/page.png') return send('image/png', f.pagePng);
    if (u === '/img/logo.png') return send('image/png', f.logoPng);
    const m = u.match(/^\/comic\/chapter\/(\d+)$/);
    if (m) return send('text/html; charset=utf-8', comicHtml(m[1] ?? ''));
    r.statusCode = 404;
    r.end('not found');
  });
  await new Promise<void>((res) => srv.listen(0, '127.0.0.1', res));
  const { port } = srv.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise((res) => srv.close(() => res())) };
}
