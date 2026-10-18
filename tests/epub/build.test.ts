import JSZip from 'jszip';
import { expect, test } from 'vitest';
import { buildEpub } from '../../src/epub/build';
import type { Book, Chapter } from '../../src/core/types';

const ch = (id: string, title: string, headings: Chapter['headings'] = [], body = '<p>Texto</p>'): Chapter => ({
  id, title, xhtmlBody: body, headings,
});
const book = (over: Partial<Book> = {}): Book => ({
  title: 'Livro', author: 'Autor', language: 'pt-BR',
  identifier: 'urn:uuid:11111111-1111-4111-8111-111111111111',
  modified: new Date('2026-10-18T12:00:00Z'),
  chapters: [ch('1', 'Cap')], images: [], ...over,
});
const open = async (b: Book) => JSZip.loadAsync(await buildEpub(b));
const text = async (z: JSZip, p: string) => z.file(p)!.async('string');

test('mimetype é a primeira entrada, sem compressão, conteúdo exato', async () => {
  const data = await buildEpub(book());
  const z = await JSZip.loadAsync(data);
  const names = Object.keys(z.files);
  expect(names[0]).toBe('mimetype');
  expect(await text(z, 'mimetype')).toBe('application/epub+zip');
  // local header: método de compressão (offset 8) = 0 (STORE), nome em offset 30
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  expect(dv.getUint16(8, true)).toBe(0);
  expect(new TextDecoder().decode(data.slice(30, 38))).toBe('mimetype');
});

test('opf tem título, autor, idioma, identificador e dcterms:modified', async () => {
  const z = await open(book());
  const opf = await text(z, 'OEBPS/content.opf');
  expect(opf).toContain('<dc:title>Livro</dc:title>');
  expect(opf).toContain('<dc:creator>Autor</dc:creator>');
  expect(opf).toContain('<dc:language>pt-BR</dc:language>');
  expect(opf).toContain('urn:uuid:11111111-1111-4111-8111-111111111111');
  expect(opf).toContain('<meta property="dcterms:modified">2026-10-18T12:00:00Z</meta>');
  expect(await text(z, 'META-INF/container.xml')).toContain('OEBPS/content.opf');
  for (const p of ['OEBPS/nav.xhtml', 'OEBPS/toc.ncx', 'OEBPS/style.css', 'OEBPS/chapters/c1.xhtml']) {
    expect(z.file(p), p).not.toBeNull();
  }
});

test('capítulo sem headings gera nav e ncx com uma entrada = título', async () => {
  const z = await open(book({ chapters: [ch('1', 'Meu Artigo')] }));
  const nav = await text(z, 'OEBPS/nav.xhtml');
  expect(nav).toContain('<a href="chapters/c1.xhtml">Meu Artigo</a>');
  expect(nav.match(/<li>/g)).toHaveLength(1);
  const ncx = await text(z, 'OEBPS/toc.ncx');
  expect(ncx).toContain('<text>Meu Artigo</text>');
  expect(ncx.match(/<navPoint /g)).toHaveLength(1);
});

test('1 capítulo com headings: topo são os headings', async () => {
  const z = await open(book({ chapters: [ch('1', 'T', [
    { level: 1, text: 'H1', anchor: 'x1' }, { level: 2, text: 'H2', anchor: 'x2' },
  ])] }));
  const nav = await text(z, 'OEBPS/nav.xhtml');
  expect(nav).toContain('<a href="chapters/c1.xhtml#x1">H1</a>');
  expect(nav).toContain('<a href="chapters/c1.xhtml#x2">H2</a>');
  expect(nav).not.toContain('>T</a>');
});

test('2 capítulos: nav tem 2 entradas de topo com headings aninhados', async () => {
  const z = await open(book({ chapters: [
    ch('1', 'Um', [{ level: 1, text: 'A', anchor: 'a' }]),
    ch('2', 'Dois', [{ level: 1, text: 'B', anchor: 'b' }]),
  ] }));
  const nav = await text(z, 'OEBPS/nav.xhtml');
  const doc = countTopLevel(nav);
  expect(doc.topLevel).toBe(2);
  expect(nav).toContain('<a href="chapters/c1.xhtml">Um</a>');
  expect(nav).toContain('<a href="chapters/c2.xhtml#b">B</a>');
  const ncx = await text(z, 'OEBPS/toc.ncx');
  expect(ncx).toContain('src="chapters/c2.xhtml#b"');
});

test('caracteres especiais no título ficam escapados no opf/nav', async () => {
  const title = 'A & B < "C" ação 📚';
  const z = await open(book({ title, author: 'X & Y', chapters: [ch('1', title)] }));
  const esc = 'A &amp; B &lt; &quot;C&quot; ação 📚';
  expect(await text(z, 'OEBPS/content.opf')).toContain(`<dc:title>${esc}</dc:title>`);
  expect(await text(z, 'OEBPS/content.opf')).toContain('X &amp; Y');
  expect(await text(z, 'OEBPS/nav.xhtml')).toContain(esc);
  expect(await text(z, 'OEBPS/toc.ncx')).toContain(esc);
  expect(await text(z, 'OEBPS/chapters/c1.xhtml')).toContain(`<title>${esc}</title>`);
});

test('corpo com xmlns no elemento de topo é aceito e imagens vão para o manifest', async () => {
  const z = await open(book({
    chapters: [ch('1', 'C', [], '<p xmlns="http://www.w3.org/1999/xhtml">oi</p>')],
    images: [{ href: 'img1.png', mediaType: 'image/png', data: new Uint8Array([1, 2, 3]) }],
  }));
  expect(await text(z, 'OEBPS/chapters/c1.xhtml')).toContain('<p xmlns="http://www.w3.org/1999/xhtml">oi</p>');
  expect(z.file('OEBPS/images/img1.png')).not.toBeNull();
  expect(await text(z, 'OEBPS/content.opf')).toContain('href="images/img1.png" media-type="image/png"');
});

// conta <li> de topo no <nav epub:type="toc"> sem depender de DOM
function countTopLevel(nav: string) {
  const ol = nav.slice(nav.indexOf('<ol>'), nav.indexOf('</nav>'));
  let depth = 0, topLevel = 0;
  for (const m of ol.matchAll(/<(\/?)(ol|li)>/g)) {
    if (m[2] === 'ol') depth += m[1] ? -1 : 1;
    else if (!m[1] && depth === 1) topLevel++;
  }
  return { topLevel };
}
