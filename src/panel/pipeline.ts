import { t } from '../core/i18n';
import { sanitizeFilename } from '../core/filename';
import type { Book, EpubFile, ExtractedItem } from '../core/types';
import type { QueueItem } from '../queue/queue';
import { buildEpub } from '../epub/build';
import { htmlToChapter } from '../extract/to-chapter';
import { embedImages, type EmbedDeps } from '../images/embed';
import { getGrayscale } from '../settings/store';

export interface ImageOptions {
  fetchFn?: typeof fetch;
  grayscale?: boolean; // padrão: configuração do usuário (lida uma vez por exportação)
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** Só para testes: substitui download/conversão reais. */
  embed?: Pick<EmbedDeps, 'fetchImage' | 'convert'>;
}

function chapterName(n: number): string {
  try {
    const s = t('chapterN', [String(n)]);
    if (s !== 'chapterN') return s;
  } catch {
    // sem browser.i18n (testes): cai no inglês.
  }
  return `Chapter ${n}`;
}

/** Monta um livro de 1 capítulo a partir do item extraído (com título/autor editados) e gera o EPUB. */
async function buildItem(
  item: ExtractedItem & { parts?: QueueItem['parts'] },
  edits: { title: string; author: string },
  img: ImageOptions,
): Promise<{ file: EpubFile; failed: number }> {
  const itemTitle = edits.title.trim() || item.title;
  let chapters =
    item.kind === 'merged' && item.parts
      ? item.parts.map((p, i) => htmlToChapter(p.html, { id: 'c' + (i + 1), title: p.title.trim() || chapterName(i + 1) }))
      : [htmlToChapter(item.html, { id: 'c1', title: itemTitle })];
  let images: Book['images'] = [];
  let failed = 0;
  if (chapters.some((c) => (c.imageUrls?.length ?? 0) > 0)) {
    const r = await embedImages(chapters, {
      fetchFn: img.fetchFn ?? ((...a) => fetch(...a)),
      grayscale: img.grayscale ?? (await getGrayscale()),
      signal: img.signal,
      onProgress: img.onProgress,
      ...img.embed,
    });
    chapters = r.chapters;
    images = r.images;
    failed = r.failed;
  }
  const title = edits.title.trim() || chapters[0]!.title.trim() || 'kindlefly';
  const author = edits.author.trim() || item.author.trim() || 'kindlefly';
  const book: Book = {
    title,
    author,
    language: item.language || 'en',
    identifier: 'urn:uuid:' + crypto.randomUUID(),
    modified: new Date(),
    chapters,
    images,
  };
  return { file: { filename: sanitizeFilename(title) + '.epub', data: await buildEpub(book) }, failed };
}

export async function itemToEpub(
  item: ExtractedItem & { parts?: QueueItem['parts'] },
  edits: { title: string; author: string },
  img: ImageOptions = {},
): Promise<EpubFile> {
  return (await buildItem(item, edits, img)).file;
}

/** Um EPUB por item (título/autor salvos no item); nomes repetidos no lote ganham " (2)", " (3)"… */
export async function itemsToEpubs(
  items: QueueItem[],
  img: ImageOptions = {},
): Promise<{ files: EpubFile[]; failedImages: number }> {
  const used = new Map<string, number>();
  const files: EpubFile[] = [];
  let failedImages = 0;
  let doneBefore = 0;
  let totalBefore = 0;
  let grayscale = img.grayscale;
  if (grayscale === undefined) {
    try {
      grayscale = await getGrayscale();
    } catch {
      grayscale = true; // sem storage (testes): padrão do produto
    }
  }
  for (const item of items) {
    let last = { done: 0, total: 0 };
    const { file: f, failed } = await buildItem(item, { title: item.title, author: item.author }, {
      ...img,
      grayscale,
      onProgress: (d, t) => {
        last = { done: d, total: t };
        img.onProgress?.(doneBefore + d, totalBefore + t);
      },
    });
    failedImages += failed;
    doneBefore += last.done;
    totalBefore += last.total;
    const base = f.filename.replace(/\.epub$/, '');
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    files.push(n === 1 ? f : { ...f, filename: `${base} (${n}).epub` });
  }
  return { files, failedImages };
}
