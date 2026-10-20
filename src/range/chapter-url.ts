export const RANGE_MAX = 100;

export interface ChapterUrl {
  /** origin + caminho até o último segmento (termina em '/'). */
  base: string;
  /** Parte não numérica do último segmento ('' ou 'chapter-'). */
  prefix: string;
  number: number;
  /** Largura dos dígitos (preserva zeros à esquerda); 0 = sem preenchimento. */
  width?: number;
  /** O pathname original terminava em '/'. */
  trailingSlash?: boolean;
}

export function parseChapterUrl(url: string | undefined): ChapterUrl | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const path = u.pathname.replace(/\/+$/, '');
  const cut = path.lastIndexOf('/');
  const m = /^(\D*?)(\d+)$/.exec(path.slice(cut + 1));
  if (!m) return null;
  const digits = m[2]!;
  const number = Number(digits);
  if (!Number.isSafeInteger(number)) return null;
  return {
    base: u.origin + path.slice(0, cut + 1),
    prefix: m[1]!,
    number,
    trailingSlash: u.pathname.length > 1 && u.pathname.endsWith('/'),
    width: digits.length > 1 && digits.startsWith('0') ? digits.length : 0,
  };
}

export function chapterUrl(c: ChapterUrl, n: number): string {
  return `${c.base}${c.prefix}${String(n).padStart(c.width ?? 0, '0')}${c.trailingSlash ? '/' : ''}`;
}

export function validateRange(from: number, to: number): 'ok' | 'invalid' | 'too_many' {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > to) return 'invalid';
  return to - from + 1 > RANGE_MAX ? 'too_many' : 'ok';
}
