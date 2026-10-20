import { KfError } from '../core/errors';
import { isBlankRow, JPEG_QUALITY, sliceRanges, sliceSourceRect, targetSize } from './layout';

export interface JpegSlice {
  data: Uint8Array;
  width: number;
  height: number;
}

/** Linhas escaladas lidas por vez na detecção de linhas lisas. */
const BAND_ROWS = 256;
/** Largura máxima do canvas da detecção de linhas lisas (1 linha = 1 linha escalada). */
const LUMA_MAX_WIDTH = 256;

function ctx2d(c: OffscreenCanvas, opts?: CanvasRenderingContext2DSettings): OffscreenCanvasRenderingContext2D {
  const ctx = c.getContext('2d', opts) as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new KfError('image_failed', 'canvas indisponível');
  return ctx;
}

/**
 * Roda no painel (página de extensão): usa createImageBitmap/OffscreenCanvas.
 * Escala para ≤ 1236 de largura, corta em páginas do Kindle (preferindo linhas lisas)
 * e codifica cada fatia como JPEG. Nunca cria um canvas do tamanho da imagem inteira
 * (estouraria o limite do Chrome em tiras muito altas): tudo é feito em faixas.
 * Coberto pelo e2e (jsdom não tem canvas).
 */
export async function toKindleJpegs(
  blob: Blob,
  opts: { grayscale: boolean; quality?: number },
): Promise<JpegSlice[]> {
  const quality = opts.quality ?? JPEG_QUALITY;
  try {
    const bmp = await createImageBitmap(blob);
    try {
      const { width, height } = targetSize(bmp.width, bmp.height);
      const scale = width / bmp.width;

      // 1) Linhas lisas, por faixas verticais num canvas pequeno reutilizado.
      const lw = Math.min(width, LUMA_MAX_WIDTH);
      const band = new OffscreenCanvas(lw, BAND_ROWS);
      const bctx = ctx2d(band, { willReadFrequently: true });
      const blank = new Uint8Array(height);
      const luma = new Uint8ClampedArray(lw);
      for (let y0 = 0; y0 < height; y0 += BAND_ROWS) {
        const rows = Math.min(BAND_ROWS, height - y0);
        const { sy, sh } = sliceSourceRect(y0, y0 + rows, scale, bmp.height);
        bctx.fillStyle = '#fff';
        bctx.fillRect(0, 0, lw, BAND_ROWS);
        if (sh > 0) bctx.drawImage(bmp, 0, sy, bmp.width, sh, 0, 0, lw, rows);
        const px = bctx.getImageData(0, 0, lw, rows).data;
        for (let r = 0; r < rows; r++) {
          for (let x = 0; x < lw; x++) {
            const i = (r * lw + x) * 4;
            luma[x] = 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!;
          }
          blank[y0 + r] = isBlankRow(luma) ? 1 : 0;
        }
      }
      band.width = band.height = 0;

      // 2) Cada fatia direto do bitmap, num canvas do tamanho da fatia.
      const out: JpegSlice[] = [];
      for (const [a, b] of sliceRanges(height, width, (y) => y >= 0 && y < height && blank[y] === 1)) {
        const h = b - a;
        const c = new OffscreenCanvas(width, h);
        try {
          const ctx = ctx2d(c);
          ctx.fillStyle = '#fff'; // transparência → branco
          ctx.fillRect(0, 0, width, h);
          if (opts.grayscale) ctx.filter = 'grayscale(1)';
          ctx.imageSmoothingQuality = 'high';
          const { sy, sh } = sliceSourceRect(a, b, scale, bmp.height);
          ctx.drawImage(bmp, 0, sy, bmp.width, sh, 0, 0, width, h);
          const jpeg = await c.convertToBlob({ type: 'image/jpeg', quality });
          out.push({ data: new Uint8Array(await jpeg.arrayBuffer()), width, height: h });
        } finally {
          c.width = c.height = 0;
        }
      }
      return out;
    } finally {
      bmp.close();
    }
  } catch (e) {
    throw e instanceof KfError ? e : new KfError('image_failed', String(e));
  }
}
