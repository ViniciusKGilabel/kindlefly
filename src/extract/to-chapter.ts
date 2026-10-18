import type { Chapter, Heading } from '../core/types';

const REMOVE =
  'script, style, iframe, form, input, button, object, embed, noscript, img, picture, svg, video, audio, source';
const KEEP_ATTRS = new Set(['href', 'colspan', 'rowspan', 'title']);

export function htmlToChapter(html: string, opts: { id: string; title: string }): Chapter {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;
  body.querySelectorAll(REMOVE).forEach((el) => el.remove());

  for (const el of Array.from(body.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (!KEEP_ATTRS.has(name)) {
        el.removeAttribute(attr.name);
      } else if (name === 'href' && !/^\s*(https?:|#)/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
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

  const serializer = new XMLSerializer();
  const xhtmlBody = Array.from(body.childNodes)
    .map((n) => serializer.serializeToString(n))
    .join('');
  return { id: opts.id, title, xhtmlBody, headings };
}
