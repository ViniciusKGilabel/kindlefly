import type { Chapter, EpubImage } from '../core/types';
import { fetchImageBlob } from './fetch-image';
import { toKindleJpegs, type JpegSlice } from './convert';
import { IMAGE_CONCURRENCY, JPEG_QUALITY } from './layout';

/**
 * Cache em memória durante uma exportação: o download por URL e as fatias por
 * URL + qualidade + tons de cinza. Falhas também ficam (não tenta de novo).
 */
export interface ImageCache {
  blobs: Map<string, Promise<Blob>>;
  slices: Map<string, Promise<JpegSlice[]>>;
}

export function createImageCache(): ImageCache {
  return { blobs: new Map(), slices: new Map() };
}

function cached<T>(map: Map<string, Promise<T>> | undefined, key: string, make: () => Promise<T>): Promise<T> {
  if (!map) return make();
  let p = map.get(key);
  if (!p) {
    p = make();
    map.set(key, p);
  }
  return p;
}

export interface EmbedDeps {
  fetchFn: typeof fetch;
  grayscale: boolean;
  /** Qualidade do JPEG (padrão JPEG_QUALITY). */
  quality?: number;
  cache?: ImageCache;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** Injetáveis para teste; os padrões são o download e a conversão reais. */
  fetchImage?: (url: string, fetchFn: typeof fetch, signal?: AbortSignal) => Promise<Blob>;
  convert?: (blob: Blob, opts: { grayscale: boolean; quality: number }) => Promise<JpegSlice[]>;
}

const IMG_MARKER = /<img\b[^>]*\bsrc=(["'])kf-img:(\d+)\1[^>]*>/g;

/** Página de quadrinho: cada fatia vira sua própria `div.kf-page` (começa em página nova). */
const PAGE_MARKER = /<div class="kf-page"><img\b[^>]*\bsrc=(["'])kf-img:(\d+)\1[^>]*><\/div>/g;

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
  const quality = d.quality ?? JPEG_QUALITY;

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
        const url = urls[i]!;
        const blob = await cached(d.cache?.blobs, url, () => fetchImage(url, d.fetchFn, d.signal));
        const key = `${quality}|${d.grayscale ? 'g' : 'c'}|${url}`;
        const slices = await cached(d.cache?.slices, key, () => convert(blob, { grayscale: d.grayscale, quality }));
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
    const filesOf = (idx: string): string[] | undefined => {
      const url = local[Number(idx)];
      return url === undefined ? undefined : keptOf.get(globalOf.get(url)!);
    };
    const withPages = c.xhtmlBody.replace(PAGE_MARKER, (_tag, _q: string, idx: string) =>
      (filesOf(idx) ?? []).map((f) => `<div class="kf-page"><img src="../images/${f}" alt="" /></div>`).join(''),
    );
    const xhtmlBody = withPages.replace(IMG_MARKER, (tag, _q: string, idx: string) => {
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
