// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { extractComicImages } from '../../src/extract/comic';
import { extractFromDocument } from '../../src/extract/readability';
import { resolveLazyImages } from '../../src/extract/lazy-images';

const parse = (h: string) => new DOMParser().parseFromString(h, 'text/html');
const load = (f: string) => parse(readFileSync(`tests/fixtures/${f}`, 'utf8'));

describe('extractComicImages', () => {
  test('leitor: logo, pôster e rodapé ficam de fora; só as 12 páginas em ordem', () => {
    const r = extractComicImages(load('comic-reader.html'))!;
    expect(r).toHaveLength(12);
    expect(r[0]).toBe('https://cdn.example.com/chapters/series/10/p00.webp?v=1');
    expect(r[11]).toBe('https://cdn.example.com/chapters/series/10/p11.webp?v=1');
  });
  test('sem marcação de página: 6 imagens grandes num container', () => {
    expect(extractComicImages(load('comic-plain.html'))).toHaveLength(6);
  });
  test('artigo com 2 imagens → null', () => {
    const d = parse('<body><div><img src="https://a.example/1.jpg"><img src="https://a.example/2.jpg"><p>texto</p></div></body>');
    expect(extractComicImages(d)).toBeNull();
  });
  test('muito texto com várias imagens → null', () => {
    const words = Array(300).fill('palavra').join(' ');
    const imgs = [1, 2, 3, 4].map((i) => `<img src="https://a.example/${i}.jpg">`).join('');
    expect(extractComicImages(parse(`<body><article><p>${words}</p>${imgs}</article></body>`))).toBeNull();
  });
  test('página de texto → null', () => {
    expect(extractComicImages(load('blog-post.html'))).toBeNull();
  });
  test('data-src resolvido por resolveLazyImages', () => {
    const imgs = [1, 2, 3].map((i) => `<img src="data:image/gif;base64,R0lG" data-src="/p${i}.jpg" data-page-index="${i}">`).join('');
    const d = parse(`<body><div>${imgs}</div></body>`);
    resolveLazyImages(d, 'https://site.example/c/1');
    expect(extractComicImages(d)).toEqual(['https://site.example/p1.jpg', 'https://site.example/p2.jpg', 'https://site.example/p3.jpg']);
  });
  test('remove repetidas e ignora src não http(s)', () => {
    const d = parse('<body><div><img src="https://a.example/1.jpg"><img src="https://a.example/1.jpg"><img src="https://a.example/2.jpg"><img src="data:image/gif;base64,R0lG"><img src="https://a.example/3.jpg"><img src="https://a.example/4.jpg"></div></body>');
    expect(extractComicImages(d)).toEqual(['https://a.example/1.jpg', 'https://a.example/2.jpg', 'https://a.example/3.jpg', 'https://a.example/4.jpg']);
  });
  test('alt "Page N" marca páginas', () => {
    const pages = [1, 2, 3].map((i) => `<img src="https://a.example/p${i}.jpg" alt="Page ${i}">`).join('');
    const d = parse(`<body><div><img src="https://a.example/x.jpg" alt="ad">${pages}</div></body>`);
    expect(extractComicImages(d)).toHaveLength(3);
  });
});

const words = (n: number) => Array(n).fill('palavra').join(' ');
const big = (i: number, extra = '') => `<img src="https://a.example/s/${i}.jpg" ${extra}>`;

describe('falsos positivos e ruído', () => {
  test('artigo longo com galeria de 5 imagens → null', () => {
    const g = [1, 2, 3, 4, 5].map((i) => big(i)).join('');
    expect(extractComicImages(parse(`<body><article><p>${words(500)}</p><div class="gallery">${g}</div></article></body>`))).toBeNull();
  });
  test('post curto (150 palavras) com 3 imagens soltas → null', () => {
    const g = [1, 2, 3].map((i) => big(i)).join('');
    expect(extractComicImages(parse(`<body><p>${words(150)}</p>${g}</body>`))).toBeNull();
  });
  test('leitor marcado com ~400 palavras de comentários → quadrinho', () => {
    const g = [1, 2, 3, 4].map((i) => big(i, `data-page-index="${i}"`)).join('');
    expect(extractComicImages(parse(`<body><div>${g}</div><section><p>${words(400)}</p></section></body>`))).toHaveLength(4);
  });
  test('leitor sem marcação, 6 imagens e ~100 palavras → quadrinho', () => {
    const g = [1, 2, 3, 4, 5, 6].map((i) => big(i)).join('');
    expect(extractComicImages(parse(`<body><p>${words(100)}</p><div>${g}</div></body>`))).toHaveLength(6);
  });
  test('texto em nav/script não conta; imagens minúsculas são ignoradas', () => {
    const g = [1, 2, 3, 4].map((i) => big(i)).join('');
    const tiny = '<img src="https://a.example/t1.gif" width="1" height="1"><img src="https://a.example/t2.gif" width="50">';
    const d = parse(`<body><nav>${words(900)}</nav><script>${words(900)}</script><div>${tiny}${g}</div></body>`);
    expect(extractComicImages(d)).toHaveLength(4);
  });
  test('ruído só por palavra delimitada no alt/class/arquivo', () => {
    const mk = (src: string) => [1, 2, 3, 4].map((i) => `<img src="https://a.example/${src.replace('01', '0' + i)}">`).join('');
    expect(extractComicImages(parse(`<body><div>${mk('discovery-of-x/01.jpg')}</div></body>`))).toHaveLength(4);
    expect(extractComicImages(parse(`<body><div>${mk('silicon/01.jpg')}</div></body>`))).toHaveLength(4);
    expect(extractComicImages(parse(`<body><div>${mk('site-logo-01.png').replace(/-01/g, '')}</div></body>`))).toBeNull();
  });
});

describe('regras de borda', () => {
  test('1-2 páginas marcadas + 4 não marcadas → null (sem fallback)', () => {
    const marked = [1, 2].map((i) => `<img src="https://a.example/p${i}.jpg" alt="Page ${i}">`).join('');
    const rest = [3, 4, 5, 6].map((i) => big(i)).join('');
    expect(extractComicImages(parse(`<body><div>${marked}${rest}</div></body>`))).toBeNull();
  });
  test('width em porcentagem não conta como pequena', () => {
    const g = [1, 2, 3, 4].map((i) => big(i, 'width="50%"')).join('');
    expect(extractComicImages(parse(`<body><div>${g}</div></body>`))).toHaveLength(4);
  });
  test('um site-logo.png entre páginas normais é descartado, o resto fica', () => {
    const g = [1, 2, 3, 4].map((i) => big(i)).join('');
    const d = parse(`<body><div><img src="https://a.example/site-logo.png">${g}</div></body>`);
    expect(extractComicImages(d)).toEqual([1, 2, 3, 4].map((i) => `https://a.example/s/${i}.jpg`));
  });
});

describe('marcação data-page (E)', () => {
  const pages = (attrs: (i: number) => string) =>
    [1, 2, 3, 4].map((i) => `<img src="https://a.example/p${i}.jpg" ${attrs(i)}>`).join('');
  test('data-page não numérico na raiz (Inertia) não marca as imagens', () => {
    const logo = '<img src="https://a.example/x1.jpg"><img src="https://a.example/x2.jpg"><img src="https://a.example/x3.jpg">';
    // 3 imagens soltas na raiz com data-page JSON: antes viravam "quadrinho marcado".
    const d = parse(`<body><div id="app" data-page='{"component":"Post","props":{}}'><article><p>texto</p>${logo}</article></div></body>`);
    expect(extractComicImages(d)).toBeNull();
  });
  test('data-page numérico em ancestral distante não conta', () => {
    const d = parse(`<body><div data-page="1"><section><div>${'<img src="https://a.example/1.jpg"><img src="https://a.example/2.jpg"><img src="https://a.example/3.jpg">'}</div></section></div></body>`);
    expect(extractComicImages(d)).toBeNull();
  });
  test('data-page numérico no pai direto marca', () => {
    const g = [1, 2, 3].map((i) => `<div data-page="${i}"><img src="https://a.example/p${i}.jpg"></div>`).join('');
    expect(extractComicImages(parse(`<body><div>${g}</div></body>`))).toHaveLength(3);
  });
  test('data-page-index não numérico na própria img não marca', () => {
    // 3 imagens: marcadas seriam quadrinho (mín. 3); sem marcação não (mín. 4).
    const three = [1, 2, 3].map((i) => `<img src="https://a.example/p${i}.jpg" data-page-index="abc">`).join('');
    expect(extractComicImages(parse(`<body><div>${three}</div></body>`))).toBeNull();
  });
  test('data-page-index numérico na própria img marca', () => {
    expect(extractComicImages(parse(`<body><div>${pages((i) => `data-page-index=" ${i} "`)}</div></body>`))).toHaveLength(4);
  });
});

describe('extractFromDocument com quadrinho', () => {
  test('kind comic, images, html vazio, título limpo', () => {
    const r = extractFromDocument(load('comic-reader.html'), 'https://reader.example/c/10');
    expect(r.kind).toBe('comic');
    expect(r.images).toHaveLength(12);
    expect(r.html).toBe('');
    expect(r.title).toBe('Chapter 10 - Series');
    expect(r.language).toBe('en');
  });
  test('título de quadrinho perde o nome do site', () => {
    const d = load('comic-reader.html');
    d.title = 'Limitless Predation Chapter 10 - Read Online | Asura Scans';
    d.head.insertAdjacentHTML('beforeend', '<meta property="og:site_name" content="Asura Scans">');
    expect(extractFromDocument(d, 'https://reader.example/c/10').title).toBe('Limitless Predation Chapter 10');
  });
  test('artigo continua artigo', () => {
    expect(extractFromDocument(load('blog-post.html'), 'https://blog.example.com/p').kind).toBe('article');
  });
});
