import type { Book, Chapter } from '../core/types';
import { nestHeadings, type TocNode } from './toc';

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>\n';

export const MIMETYPE = 'application/epub+zip';

export const STYLE_CSS = `body { line-height: 1.5; margin: 0 1em; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; }
img { max-width: 100%; height: auto; }
pre { white-space: pre-wrap; }
blockquote { margin: 1em 2em; }
`;

export function chapterPath(n: number): string {
  return `chapters/c${n}.xhtml`;
}

export function containerXml(): string {
  return `${XML_DECL}<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;
}

function isoNoMillis(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function contentOpf(book: Book): string {
  const lang = escapeXml(book.language);
  const chapterItems = book.chapters
    .map((_, i) => `    <item id="c${i + 1}" href="${chapterPath(i + 1)}" media-type="application/xhtml+xml"/>`)
    .join('\n');
  const imageItems = book.images
    .map((im, i) => `    <item id="img${i + 1}" href="images/${escapeXml(im.href)}" media-type="${im.mediaType}"/>`)
    .join('\n');
  const spine = book.chapters.map((_, i) => `    <itemref idref="c${i + 1}"/>`).join('\n');
  return `${XML_DECL}<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${lang}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXml(book.identifier)}</dc:identifier>
    <dc:title>${escapeXml(book.title)}</dc:title>
    <dc:creator>${escapeXml(book.author)}</dc:creator>
    <dc:language>${lang}</dc:language>
    <meta property="dcterms:modified">${isoNoMillis(book.modified)}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
${chapterItems}${imageItems ? '\n' + imageItems : ''}
  </manifest>
  <spine toc="ncx">
${spine}
  </spine>
</package>
`;
}

export interface TocEntry {
  text: string;
  href: string;
  children: TocEntry[];
}

function toEntries(nodes: TocNode[], file: string): TocEntry[] {
  return nodes.map((n) => ({
    text: n.text,
    href: `${file}#${n.anchor}`,
    children: toEntries(n.children, file),
  }));
}

/** 1 capítulo: topo = headings dele; 2+: cada capítulo é uma entrada com os headings embaixo. */
export function buildToc(chapters: Chapter[]): TocEntry[] {
  const entryFor = (c: Chapter, i: number): TocEntry[] => {
    const file = chapterPath(i + 1);
    return [{ text: c.title, href: file, children: toEntries(nestHeadings(c.headings), file) }];
  };
  if (chapters.length === 1) {
    const c = chapters[0]!;
    const nested = toEntries(nestHeadings(c.headings), chapterPath(1));
    return nested.length ? nested : entryFor(c, 0).map((e) => ({ ...e, children: [] }));
  }
  return chapters.flatMap(entryFor);
}

function navList(entries: TocEntry[], indent: string): string {
  const items = entries.map((e) => {
    const sub = e.children.length ? `\n${navList(e.children, indent + '    ')}\n${indent}  ` : '';
    return `${indent}  <li><a href="${escapeXml(e.href)}">${escapeXml(e.text)}</a>${sub}</li>`;
  });
  return `${indent}<ol>\n${items.join('\n')}\n${indent}</ol>`;
}

export function navXhtml(book: Book): string {
  const lang = escapeXml(book.language);
  return `${XML_DECL}<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(book.title)}</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
${navList(buildToc(book.chapters), '    ')}
  </nav>
</body>
</html>
`;
}

export function tocNcx(book: Book): string {
  let order = 0;
  const render = (entries: TocEntry[], indent: string): string =>
    entries
      .map((e) => {
        order += 1;
        const self = order;
        const kids = e.children.length ? '\n' + render(e.children, indent + '  ') + `\n${indent}` : '';
        return `${indent}<navPoint id="np${self}" playOrder="${self}">
${indent}  <navLabel><text>${escapeXml(e.text)}</text></navLabel>
${indent}  <content src="${escapeXml(e.href)}"/>${kids ? kids.replace(/^\n/, '\n') : ''}
${indent}</navPoint>`;
      })
      .join('\n');
  const entries = buildToc(book.chapters);
  return `${XML_DECL}<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(book.identifier)}"/>
    <meta name="dtb:depth" content="${ncxDepth(entries)}"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(book.title)}</text></docTitle>
  <navMap>
${render(entries, '    ')}
  </navMap>
</ncx>
`;
}

function ncxDepth(entries: TocEntry[]): number {
  return entries.length ? 1 + Math.max(...entries.map((e) => ncxDepth(e.children))) : 0;
}

export function chapterXhtml(chapter: Chapter, language: string): string {
  const lang = escapeXml(language);
  return `${XML_DECL}<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="${lang}" xml:lang="${lang}">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(chapter.title)}</title>
  <link rel="stylesheet" type="text/css" href="../style.css"/>
</head>
<body>
${chapter.xhtmlBody}
</body>
</html>
`;
}
