import type { Chapter, Heading } from '../core/types';

const REMOVE =
  'script, style, iframe, form, input, button, object, embed, noscript, svg, video, audio, source, link, meta, base, template';
const KNOWN = new Set(
  ('a abbr address article aside b bdi bdo blockquote br caption cite code col colgroup dd del details dfn div dl dt em ' +
    'figcaption figure footer h1 h2 h3 h4 h5 h6 header hgroup hr i img ins kbd li main mark nav ol p pre q rp rt ruby s samp ' +
    'section small span strong sub summary sup table tbody td tfoot th thead time tr u ul var wbr').split(' '),
);
// atributo -> elementos onde é permitido
const KEEP_ATTRS = new Map<string, string[] | null>([
  ['href', ['a']],
  ['colspan', ['td', 'th']],
  ['rowspan', ['td', 'th']],
  ['src', ['img']],
  ['alt', ['img']],
  ['title', null],
]);
const XML_FORBIDDEN = /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g;

function unwrap(el: Element): void {
  el.replaceWith(...Array.from(el.childNodes));
}

export function htmlToChapter(html: string, opts: { id: string; title: string }): Chapter {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;
  body.querySelectorAll(REMOVE).forEach((el) => el.remove());

  for (const el of Array.from(body.querySelectorAll('*'))) {
    if (el.localName.includes(':') || !KNOWN.has(el.localName)) unwrap(el);
  }

  for (const el of Array.from(body.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const allowed = KEEP_ATTRS.get(name);
      if (el.localName === 'img' && name !== 'src' && name !== 'alt') {
        el.removeAttribute(attr.name);
      } else if (allowed === undefined || (allowed && !allowed.includes(el.localName))) {
        el.removeAttribute(attr.name);
      } else if (name === 'href' && !/^\s*(https?:|#)/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  }

  const imageUrls: string[] = [];
  for (const img of Array.from(body.querySelectorAll('img'))) {
    const src = (img.getAttribute('src') ?? '').trim();
    if (!/^https?:\/\/\S+$/i.test(src)) {
      img.remove();
      continue;
    }
    let n = imageUrls.indexOf(src);
    if (n < 0) n = imageUrls.push(src) - 1;
    img.setAttribute('src', `kf-img:${n}`);
    if (!img.hasAttribute('alt')) img.setAttribute('alt', '');
  }

  body.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
    if (!h.textContent?.trim()) h.remove();
  });

  const title = opts.title.trim() || 'Untitled';
  const first = body.firstElementChild;
  const startsWithTitle =
    first?.tagName === 'H1' && first.textContent?.trim() === title;
  if (!startsWithTitle) {
    const h1 = doc.createElement('h1');
    h1.textContent = title;
    body.insertBefore(h1, body.firstChild);
  }

  const headings: Heading[] = [];
  body.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
    const anchor = `h-${headings.length + 1}`;
    h.setAttribute('id', anchor);
    headings.push({
      level: Number(h.tagName[1]) as Heading['level'],
      text: (h.textContent ?? '').replace(/\s+/g, ' ').trim(),
      anchor,
    });
  });

  const ids = new Set(headings.map((h) => h.anchor));
  body.querySelectorAll('a[href^="#"]').forEach((a) => {
    if (!ids.has((a.getAttribute('href') ?? '').slice(1))) unwrap(a);
  });

  const serializer = new XMLSerializer();
  const xhtmlBody = Array.from(body.childNodes)
    .map((n) => serializer.serializeToString(n))
    .join('')
    .replace(XML_FORBIDDEN, '');
  return { id: opts.id, title, xhtmlBody, headings, imageUrls };
}

const MARKER_SRC = /(\bsrc=")kf-img:(\d+)(")/g;
function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Só para a prévia: troca `kf-img:N` pela URL original da imagem. */
export function previewBody(chapter: Chapter): string {
  const urls = chapter.imageUrls ?? [];
  return chapter.xhtmlBody.replace(MARKER_SRC, (m, a: string, n: string, z: string) => {
    const u = urls[Number(n)];
    return u ? a + escAttr(u) + z : m;
  });
}
