const EXCLUDED_AREAS = 'header, nav, footer, aside';
const NOISE = /logo|avatar|icon|cover|banner/i;
const MAX_WORDS = 200;
const MIN_IMAGES = 3;

const isHttp = (u: string) => /^https?:\/\//i.test(u);

function isPageMarked(img: Element): boolean {
  return (
    img.hasAttribute('data-page') ||
    img.hasAttribute('data-page-index') ||
    img.closest('[data-page]') !== null ||
    /page\s*\d+/i.test(img.getAttribute('alt') ?? '')
  );
}

/** URLs ordenadas das páginas de um quadrinho/mangá/webtoon, ou null se a página não parece um. Rode após resolveLazyImages. */
export function extractComicImages(doc: Document): string[] | null {
  let imgs = Array.from(doc.querySelectorAll('img')).filter((img) => {
    const src = img.getAttribute('src')?.trim() ?? '';
    if (!isHttp(src)) return false;
    if (img.closest(EXCLUDED_AREAS)) return false;
    return !NOISE.test(`${img.getAttribute('alt') ?? ''} ${img.getAttribute('class') ?? ''} ${src}`);
  });
  const marked = imgs.filter(isPageMarked);
  if (marked.length > 0) imgs = marked;
  if (imgs.length < MIN_IMAGES) return null;

  // Ancestral mais profundo (a partir da 1ª imagem) que contém a maioria das candidatas.
  let group: Element | null = imgs[0]!.parentElement;
  while (group && imgs.filter((i) => group!.contains(i)).length * 2 <= imgs.length) group = group.parentElement;
  if (!group) return null;
  const inGroup = imgs.filter((i) => group!.contains(i));
  const urls = [...new Set(inGroup.map((i) => i.getAttribute('src')!.trim()))];
  if (urls.length < MIN_IMAGES) return null;

  const words = (group.textContent ?? '').split(/\s+/).filter(Boolean).length;
  return words < MAX_WORDS ? urls : null;
}
