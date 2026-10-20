const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original'];

function absolute(value: string, baseUrl: string): string {
  const v = value.trim();
  if (!v || /^(data|blob|javascript):/i.test(v)) return v;
  try {
    return new URL(v, baseUrl).href;
  } catch {
    return v;
  }
}

/** URL de maior descritor (w ou x) de um srcset; null se vazio. */
function largestFromSrcset(srcset: string | null): string | null {
  if (!srcset) return null;
  let best: { url: string; score: number } | null = null;
  for (const part of srcset.split(/,\s+|,$/)) {
    const tokens = part.trim().split(/\s+/);
    const url = tokens[0];
    if (!url) continue;
    const m = /^(\d+(?:\.\d+)?)[wx]$/i.exec(tokens[1] ?? '');
    const score = m ? Number(m[1]) : 1;
    if (!best || score > best.score) best = { url, score };
  }
  return best?.url ?? null;
}

/** Resolve imagens preguiçosas e responsivas: src ← data-src | data-lazy-src | data-original | maior srcset; absoluto. */
export function resolveLazyImages(doc: Document, baseUrl: string): void {
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    let chosen: string | null = null;
    for (const a of LAZY_ATTRS) {
      const v = img.getAttribute(a)?.trim();
      if (v) {
        chosen = v;
        break;
      }
    }
    chosen ??= largestFromSrcset(img.getAttribute('srcset')) ?? largestFromSrcset(img.getAttribute('data-srcset'));
    if (!chosen && !img.getAttribute('src')?.trim() && img.parentElement?.localName === 'picture') {
      for (const s of Array.from(img.parentElement.querySelectorAll('source'))) {
        chosen = largestFromSrcset(s.getAttribute('srcset')) ?? largestFromSrcset(s.getAttribute('data-srcset'));
        if (chosen) break;
      }
    }
    const src = chosen ?? img.getAttribute('src');
    if (src) img.setAttribute('src', absolute(src, baseUrl));
    for (const a of ['srcset', 'sizes', 'data-srcset']) img.removeAttribute(a);
  }
}
