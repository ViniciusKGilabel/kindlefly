import JSZip from 'jszip';
import type { Book } from '../core/types';
import {
  MIMETYPE, STYLE_CSS, chapterXhtml, containerXml, contentOpf, navXhtml, tocNcx,
} from './templates';

export async function buildEpub(book: Book): Promise<Uint8Array> {
  const zip = new JSZip();
  // mimetype: primeira entrada, sem compressão (exigência do OCF).
  zip.file('mimetype', MIMETYPE, { compression: 'STORE' });
  zip.file('META-INF/container.xml', containerXml());
  zip.file('OEBPS/content.opf', contentOpf(book));
  zip.file('OEBPS/nav.xhtml', navXhtml(book));
  zip.file('OEBPS/toc.ncx', tocNcx(book));
  zip.file('OEBPS/style.css', STYLE_CSS);
  book.chapters.forEach((c, i) => {
    zip.file(`OEBPS/chapters/c${i + 1}.xhtml`, chapterXhtml(c, book.language));
  });
  // JPEG já é comprimido: STORE evita gastar tempo comprimindo de novo (ganho ~0).
  for (const im of book.images) zip.file(`OEBPS/images/${im.href}`, im.data, { compression: 'STORE' });
  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    mimeType: MIMETYPE,
  });
}
