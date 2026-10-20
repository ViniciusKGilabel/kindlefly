/** Largura máxima da imagem no EPUB (nunca ampliar). */
export const IMAGE_MAX_WIDTH = 1236;
/** Proporção de uma página do Kindle (altura / largura). */
export const PAGE_ASPECT = 1648 / 1236;
/** Downloads de imagem simultâneos (usado pelo painel, Task 3). */
export const IMAGE_CONCURRENCY = 4;
/** Tamanho máximo de uma imagem baixada, em bytes (20 MB). */
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
/** Qualidade do JPEG gerado. */
export const JPEG_QUALITY = 0.8;

/** Desvio-padrão máximo (populacional) de luma para considerar a linha lisa. */
const BLANK_STDDEV = 6;
/** Tolerância: só corta se a altura passar de P × este fator. */
const CUT_THRESHOLD = 1.25;
/** Janela de busca de corte: de 0.75P até P a partir do início da fatia. */
const SEARCH_MIN = 0.75;
/** Fatia final menor que este fração de P é anexada à anterior. */
const MIN_TAIL = 0.25;

/** Tamanho de saída: escala para largura ≤ IMAGE_MAX_WIDTH, nunca amplia. */
export function targetSize(w: number, h: number): { width: number; height: number } {
  if (w <= IMAGE_MAX_WIDTH) return { width: w, height: h };
  const scale = IMAGE_MAX_WIDTH / w;
  return {
    width: IMAGE_MAX_WIDTH,
    height: Math.max(1, Math.round(h * scale)),
  };
}

/** Uma linha de pixels é "lisa" se o desvio-padrão dos valores de luma é < 6. */
export function isBlankRow(luma: Uint8ClampedArray | number[]): boolean {
  const n = luma.length;
  if (n === 0) return true;
  let sum = 0;
  for (const v of luma) sum += v;
  const mean = sum / n;
  let sq = 0;
  for (const v of luma) {
    const d = v - mean;
    sq += d * d;
  }
  return Math.sqrt(sq / n) < BLANK_STDDEV;
}

/**
 * Intervalos [início, fim) para cortar uma tira em páginas do Kindle.
 * Cada corte fica em y0 + P, ou na faixa lisa mais próxima dele entre
 * y0 + 0.75P e y0 + P.
 * `height`/`width` são as dimensões ESCALADAS (resultado de targetSize) e
 * `blankRows` deve ser avaliada na imagem escalada.
 */
export function sliceRanges(
  height: number,
  width: number,
  blankRows: (y: number) => boolean,
): Array<[number, number]> {
  if (height <= 0) return [];
  const P = Math.max(1, Math.round(width * PAGE_ASPECT));
  if (height <= P * CUT_THRESHOLD) return [[0, height]];

  const ranges: Array<[number, number]> = [];
  let y0 = 0;
  while (height - y0 > P * CUT_THRESHOLD) {
    const ideal = y0 + P;
    const lowest = Math.ceil(y0 + P * SEARCH_MIN);
    let cut = ideal;
    for (let y = ideal; y >= lowest; y--) {
      if (blankRows(y)) {
        cut = y;
        break;
      }
    }
    ranges.push([y0, cut]);
    y0 = cut;
  }
  ranges.push([y0, height]);

  // Defensivo: a fatia final nunca fica menor que 0.25P sozinha.
  const tail = ranges.pop();
  const prev = ranges[ranges.length - 1];
  if (tail && prev && tail[1] - tail[0] < P * MIN_TAIL) {
    prev[1] = tail[1];
  } else if (tail) {
    ranges.push(tail);
  }
  return ranges;
}

/**
 * Retângulo de origem (no bitmap) para a fatia escalada [a, b).
 * `scale` = largura escalada / largura original. Limita a [0, srcHeight].
 */
export function sliceSourceRect(
  a: number,
  b: number,
  scale: number,
  srcHeight: number,
): { sy: number; sh: number } {
  const sy = Math.min(srcHeight, Math.max(0, a / scale));
  const end = Math.min(srcHeight, Math.max(sy, b / scale));
  return { sy, sh: end - sy };
}
