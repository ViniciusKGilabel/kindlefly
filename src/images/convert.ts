import { isBlankRow, JPEG_QUALITY, sliceRanges, targetSize } from './layout';

export interface JpegSlice {
  data: Uint8Array;
  width: number;
  height: number;
}

/** Linhas lidas por getImageData, para não alocar a imagem inteira de uma vez. */
const BAND_ROWS = 512;

/**
 * Roda no painel (página de extensão): usa createImageBitmap/OffscreenCanvas.
 * Escala para ≤ 1236 de largura, corta em páginas do Kindle (preferindo linhas lisas)
 * e codifica cada fatia como JPEG. Coberto pelo e2e (jsdom não tem canvas).
 */
export async function toKindleJpegs(blob: Blob, opts: { grayscale: boolean }): Promise<JpegSlice[]> {
  const bmp = await createImageBitmap(blob);
  try {
    const { width, height } = targetSize(bmp.width, bmp.height);

    // Imagem escalada sobre fundo branco (transparência → branco).
    const full = new OffscreenCanvas(width, height);
    const fctx = full.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    fctx.fillStyle = '#fff';
    fctx.fillRect(0, 0, width, height);
    if (opts.grayscale) fctx.filter = 'grayscale(1)';
    fctx.drawImage(bmp, 0, 0, width, height);
    fctx.filter = 'none';

    // Linhas lisas, calculadas em faixas horizontais e guardadas como booleanos.
    const blank = new Uint8Array(height);
    const luma = new Uint8ClampedArray(width);
    for (let y0 = 0; y0 < height; y0 += BAND_ROWS) {
      const rows = Math.min(BAND_ROWS, height - y0);
      const px = fctx.getImageData(0, y0, width, rows).data;
      for (let r = 0; r < rows; r++) {
        for (let x = 0; x < width; x++) {
          const i = (r * width + x) * 4;
          luma[x] = 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!;
        }
        blank[y0 + r] = isBlankRow(luma) ? 1 : 0;
      }
    }

    const out: JpegSlice[] = [];
    for (const [a, b] of sliceRanges(height, width, (y) => y >= 0 && y < height && blank[y] === 1)) {
      const h = b - a;
      const c = new OffscreenCanvas(width, h);
      const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
      ctx.drawImage(full, 0, a, width, h, 0, 0, width, h); // já branco/cinza
      const jpeg = await c.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
      out.push({ data: new Uint8Array(await jpeg.arrayBuffer()), width, height: h });
    }
    return out;
  } finally {
    bmp.close();
  }
}
