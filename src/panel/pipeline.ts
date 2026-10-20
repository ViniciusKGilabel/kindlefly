import { t } from '../core/i18n';
import { sanitizeFilename } from '../core/filename';
import type { Book, EpubFile, ExtractedItem } from '../core/types';
import type { QueueItem } from '../queue/queue';
import { buildEpub } from '../epub/build';
import { comicToChapter, htmlToChapter } from '../extract/to-chapter';
import { embedImages, type EmbedDeps, type ImageCache } from '../images/embed';
import { KfError } from '../core/errors';
import { getGrayscale } from '../settings/store';

export interface ImageOptions {
  fetchFn?: typeof fetch;
  grayscale?: boolean; // padrão: configuração do usuário (lida uma vez por exportação)
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** Qualidade do JPEG (padrão JPEG_QUALITY). */
  quality?: number;
  /** Reaproveita downloads/conversões entre construções da mesma exportação. */
  cache?: ImageCache;
  /** Só para testes: substitui download/conversão reais. */
  embed?: Pick<EmbedDeps, 'fetchImage' | 'convert'>;
}

export type SourceItem = ExtractedItem & { parts?: QueueItem['parts'] };

export function chapterName(n: number): string {
  try {
    const s = t('chapterN', [String(n)]);
    if (s !== 'chapterN') return s;
  } catch {
    // sem browser.i18n (testes): cai no inglês.
  }
  return `Chapter ${n}`;
}

export async function resolveGrayscale(img: ImageOptions): Promise<boolean> {
  if (img.grayscale !== undefined) return img.grayscale;
  try {
    return await getGrayscale();
  } catch {
    return true; // sem storage (testes): padrão do produto
  }
}

/** Título exibido do item (para avisos de falha). */
export function itemLabel(item: { title: string; sourceUrl: string }): string {
  return item.title.trim() || item.sourceUrl;
}

/** Erro "não dá para gerar este item" (o lote segue com os outros). */
export function isItemFailure(e: unknown): boolean {
  return e instanceof KfError;
}

export interface BuiltItem {
  file: EpubFile;
  /** Imagens que não puderam ser incluídas. */
  failed: number;
  /** Quantas URLs de imagem o livro tinha (0 = reconverter não muda nada). */
  imageCount: number;
}

/**
 * Monta o livro do item (com título/autor editados) e gera o EPUB.
 * Capítulo de quadrinho que ficou sem nenhuma página não entra; se não sobrar
 * capítulo, falha com image_failed.
 */
export async function buildItem(
  item: SourceItem,
  edits: { title: string; author: string },
  img: ImageOptions,
): Promise<BuiltItem> {
  const itemTitle = edits.title.trim() || item.title;
  const toChapter = (src: { html: string; images?: string[] }, id: string, title: string) =>
    src.images ? comicToChapter(src.images, { id, title }) : htmlToChapter(src.html, { id, title });
  const sources: Array<{ src: { html: string; images?: string[] }; title: string }> =
    item.kind === 'merged' && item.parts
      ? item.parts.map((p, i) => ({ src: p, title: p.title.trim() || chapterName(i + 1) }))
      : [{ src: item.kind === 'comic' ? item : { html: item.html }, title: itemTitle }];
  let chapters = sources.map((s, i) => toChapter(s.src, 'c' + (i + 1), s.title));
  const isComic = sources.map((s) => !!s.src.images);
  const firstTitle = chapters[0]?.title.trim() ?? '';
  const imageCount = new Set(chapters.flatMap((c) => c.imageUrls ?? [])).size;
  let images: Book['images'] = [];
  let failed = 0;
  if (imageCount > 0) {
    const r = await embedImages(chapters, {
      fetchFn: img.fetchFn ?? ((...a) => fetch(...a)),
      grayscale: await resolveGrayscale(img),
      signal: img.signal,
      onProgress: img.onProgress,
      quality: img.quality,
      cache: img.cache,
      ...img.embed,
    });
    chapters = r.chapters.filter((c, i) => !isComic[i] || c.xhtmlBody.includes('class="kf-page"'));
    images = r.images;
    failed = r.failed;
  }
  if (chapters.length === 0) throw new KfError('image_failed', 'nenhuma página');
  const title = edits.title.trim() || firstTitle || 'kindlefly';
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
  return {
    file: { filename: sanitizeFilename(title) + '.epub', data: await buildEpub(book) },
    failed,
    imageCount,
  };
}

/** Nomes repetidos no lote ganham " (2)", " (3)"… */
export function uniqueNamer(): (f: EpubFile) => EpubFile {
  const used = new Map<string, number>();
  return (f) => {
    const base = f.filename.replace(/\.epub$/, '');
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n === 1 ? f : { ...f, filename: `${base} (${n}).epub` };
  };
}

export async function itemToEpub(
  item: SourceItem,
  edits: { title: string; author: string },
  img: ImageOptions = {},
): Promise<EpubFile> {
  return (await buildItem(item, edits, img)).file;
}

/** Um EPUB por item (título/autor salvos no item); item que não pôde ser gerado vai em failedItems. */
export async function itemsToEpubs(
  items: QueueItem[],
  img: ImageOptions = {},
): Promise<{ files: EpubFile[]; failedImages: number; failedItems: string[] }> {
  const name = uniqueNamer();
  const files: EpubFile[] = [];
  const failedItems: string[] = [];
  let failedImages = 0;
  let doneBefore = 0;
  let totalBefore = 0;
  const grayscale = await resolveGrayscale(img);
  for (const item of items) {
    let last = { done: 0, total: 0 };
    try {
      const { file: f, failed } = await buildItem(item, { title: item.title, author: item.author }, {
        ...img,
        grayscale,
        onProgress: (d, t) => {
          last = { done: d, total: t };
          img.onProgress?.(doneBefore + d, totalBefore + t);
        },
      });
      failedImages += failed;
      files.push(name(f));
    } catch (e) {
      if (!isItemFailure(e)) throw e;
      failedItems.push(itemLabel(item));
    }
    doneBefore += last.done;
    totalBefore += last.total;
  }
  return { files, failedImages, failedItems };
}
