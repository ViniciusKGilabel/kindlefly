import type { Chapter, EpubImage } from '../core/types';
import { fetchImageBlob } from './fetch-image';
import { toKindleJpegs, type JpegSlice } from './convert';
import { IMAGE_CONCURRENCY } from './layout';

export interface EmbedDeps {
  fetchFn: typeof fetch;
  grayscale: boolean;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** Injetáveis para teste; os padrões são o download e a conversão reais. */
  fetchImage?: (url: string, fetchFn: typeof fetch, signal?: AbortSignal) => Promise<Blob>;
  convert?: (blob: Blob, opts: { grayscale: boolean }) => Promise<JpegSlice[]>;
}

const IMG_MARKER = /<img\b[^>]*\bsrc=(["'])kf-img:(\d+)\1[^>]*>/g;

function isAbort(e: unknown): boolean {
  return (e as { name?: string } | null)?.name === 'AbortError';
}

/** O valor de alt vem escapado do XMLSerializer: passa direto (só normaliza espaços/quebras). */
function altOf(tag: string): string {
  const m = /\salt="([^"]*)"/.exec(tag);
  return (m?.[1] ?? '').replace(/&#x(?:A|D|9);/gi, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Baixa, converte e embute as imagens dos capítulos (marcadores `kf-img:N`).
 * Arquivos: `i{N}-{k}.jpg`, N global ao livro (URL repetida baixa uma vez).
 */
export async function embedImages(
  chapters: Chapter[],
  d: EmbedDeps,
): Promise<{ chapters: Chapter[]; images: EpubImage[]; failed: number }> {
  const fetchImage = d.fetchImage ?? fetchImageBlob;
  const convert = d.convert ?? toKindleJpegs;

  const urls: string[] = [];
  const globalOf = new Map<string, number>();
  for (const c of chapters) {
    for (const u of c.imageUrls ?? []) {
      if (!globalOf.has(u)) {
        globalOf.set(u, urls.length);
        urls.push(u);
      }
    }
  }

  const results: Array<JpegSlice[] | null> = new Array(urls.length).fill(null);
  let next = 0;
  let done = 0;
  d.onProgress?.(0, urls.length);
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      try {
        const blob = await fetchImage(urls[i]!, d.fetchFn, d.signal);
        const slices = await convert(blob, { grayscale: d.grayscale });
        results[i] = slices.length > 0 ? slices : null;
      } catch (e) {
        if (isAbort(e)) throw e;
        results[i] = null;
      }
      done++;
      d.onProgress?.(done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, urls.length) }, worker));

  const images: EpubImage[] = [];
  const keptOf = new Map<number, string[]>();
  results.forEach((slices, n) => {
    if (!slices) return;
    keptOf.set(
      n,
      slices.map((s, k) => {
        const href = `i${n}-${k}.jpg`;
        images.push({ href, mediaType: 'image/jpeg', data: s.data });
        return href;
      }),
    );
  });

  const out = chapters.map((c) => {
    const local = c.imageUrls ?? [];
    const xhtmlBody = c.xhtmlBody.replace(IMG_MARKER, (tag, _q: string, idx: string) => {
      const url = local[Number(idx)];
      const files = url === undefined ? undefined : keptOf.get(globalOf.get(url)!);
      if (!files) return '';
      const alt = altOf(tag);
      return files.map((f) => `<img src="../images/${f}" alt="${alt}" />`).join('');
    });
    return { ...c, xhtmlBody };
  });
  return { chapters: out, images, failed: results.filter((r) => r === null).length };
}
