import { sanitizeFilename } from '../core/filename';
import type { Book, EpubFile, ExtractedItem } from '../core/types';
import { buildEpub } from '../epub/build';
import { htmlToChapter } from '../extract/to-chapter';

/** Monta um livro de 1 capítulo a partir do item extraído (com título/autor editados) e gera o EPUB. */
export async function itemToEpub(
  item: ExtractedItem,
  edits: { title: string; author: string },
): Promise<EpubFile> {
  const chapter = htmlToChapter(item.html, { id: 'c1', title: edits.title.trim() || item.title });
  const title = edits.title.trim() || chapter.title.trim() || 'kindlefly';
  const author = edits.author.trim() || item.author.trim() || 'kindlefly';
  const book: Book = {
    title,
    author,
    language: item.language || 'en',
    identifier: 'urn:uuid:' + crypto.randomUUID(),
    modified: new Date(),
    chapters: [chapter],
    images: [],
  };
  return { filename: sanitizeFilename(title) + '.epub', data: await buildEpub(book) };
}
