import { sanitizeFilename } from '../core/filename';
import type { Book, EpubFile, ExtractedItem } from '../core/types';
import type { QueueItem } from '../queue/queue';
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

/** Um EPUB por item (título/autor salvos no item); nomes repetidos no lote ganham " (2)", " (3)"… */
export async function itemsToEpubs(items: QueueItem[]): Promise<EpubFile[]> {
  const used = new Map<string, number>();
  const files: EpubFile[] = [];
  for (const item of items) {
    const f = await itemToEpub(item, { title: item.title, author: item.author });
    const base = f.filename.replace(/\.epub$/, '');
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    files.push(n === 1 ? f : { ...f, filename: `${base} (${n}).epub` });
  }
  return files;
}
