const EXCLUDED_AREAS = 'header, nav, footer, aside';
const NOT_BODY = 'script, style, noscript, template, nav, header, footer, aside';
const NOISE = /(^|[-_./\s])(logo|avatar|icon|cover|banner)([-_./\s]|$)/i;
const MIN_SIDE = 100;
const MIN_MARKED = 3;
const MAX_WORDS_MARKED = 1500;
const MIN_UNMARKED = 4;
const MAX_WORDS_UNMARKED = 300;

const isHttp = (u: string) => /^https?:\/\//i.test(u);

const PAGE_ATTRS = ['data-page', 'data-page-index'];
const NUMERIC = /^\s*\d+\s*$/;

/** `data-page`/`data-page-index` numérico no próprio elemento (sites Inertia.js põem JSON em data-page na raiz). */
function hasPageNumber(el: Element | null): boolean {
  return !!el && PAGE_ATTRS.some((a) => NUMERIC.test(el.getAttribute(a) ?? ''));
}

/** Marcada como página: número de página na própria img ou no pai direto, ou alt "Page N". */
function isPageMarked(img: Element): boolean {
  return (
    hasPageNumber(img) ||
    hasPageNumber(img.parentElement) ||
    /page\s*\d+/i.test(img.getAttribute('alt') ?? '')
  );
}

function tooSmall(img: Element): boolean {
  for (const a of ['width', 'height']) {
    const v = img.getAttribute(a);
    if (v !== null && /^\s*\d+(px)?\s*$/i.test(v) && parseInt(v, 10) < MIN_SIDE) return true;
  }
  return false;
}

function filenameOf(src: string): string {
  try {
    return new URL(src).pathname.split('/').pop() ?? '';
  } catch {
    return '';
  }
}

function bodyWords(doc: Document): number {
  let n = 0;
  const walk = (el: Element) => {
    if (el.matches(NOT_BODY)) return;
    for (const c of Array.from(el.childNodes)) {
      if (c.nodeType === 3) n += (c.textContent ?? '').split(/\s+/).filter(Boolean).length;
      else if (c.nodeType === 1) walk(c as Element);
    }
  };
  if (doc.body) walk(doc.body);
  return n;
}

/** URLs ordenadas das páginas de um quadrinho/mangá/webtoon, ou null se a página não parece um. Rode após resolveLazyImages. */
export function extractComicImages(doc: Document): string[] | null {
  let imgs = Array.from(doc.querySelectorAll('img')).filter((img) => {
    const src = img.getAttribute('src')?.trim() ?? '';
    if (!isHttp(src) || tooSmall(img)) return false;
    if (img.closest(EXCLUDED_AREAS)) return false;
    return !(
      NOISE.test(img.getAttribute('alt') ?? '') ||
      NOISE.test(img.getAttribute('class') ?? '') ||
      NOISE.test(filenameOf(src))
    );
  });
  const marked = imgs.filter(isPageMarked);
  const isMarked = marked.length > 0;
  if (isMarked) {
    if (marked.length < MIN_MARKED) return null;
    imgs = marked;
  }
  if (imgs.length < (isMarked ? MIN_MARKED : MIN_UNMARKED)) return null;

  // Ancestral mais profundo (a partir da 1ª imagem) que contém a maioria das candidatas.
  let group: Element | null = imgs[0]!.parentElement;
  while (group && imgs.filter((i) => group!.contains(i)).length * 2 <= imgs.length) group = group.parentElement;
  if (!group) return null;
  const urls = [...new Set(imgs.filter((i) => group!.contains(i)).map((i) => i.getAttribute('src')!.trim()))];
  const words = bodyWords(doc);
  if (isMarked) return urls.length >= MIN_MARKED && words < MAX_WORDS_MARKED ? urls : null;
  return urls.length >= MIN_UNMARKED && words < MAX_WORDS_UNMARKED ? urls : null;
}
