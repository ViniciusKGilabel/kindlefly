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

const isData = (u: string) => /^\s*data:/i.test(u);

/** Candidatos de um srcset (algoritmo WHATWG simplificado): vírgula só separa após o token da URL. */
function parseSrcset(srcset: string): Array<{ url: string; score: number }> {
  const out: Array<{ url: string; score: number }> = [];
  let i = 0;
  const n = srcset.length;
  while (i < n) {
    while (i < n && /[\s,]/.test(srcset[i]!)) i++;
    let j = i;
    while (j < n && !/\s/.test(srcset[j]!)) j++;
    let url = srcset.slice(i, j);
    i = j;
    if (!url) break;
    let desc = '';
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, '');
    } else {
      let depth = 0;
      while (i < n && !(srcset[i] === ',' && depth === 0)) {
        if (srcset[i] === '(') depth++;
        else if (srcset[i] === ')') depth = Math.max(0, depth - 1);
        desc += srcset[i];
        i++;
      }
    }
    const m = /^\s*(\d+(?:\.\d+)?)[wx]\s*$/i.exec(desc);
    out.push({ url, score: m ? Number(m[1]) : 1 });
  }
  return out;
}

/** URL de maior descritor (w ou x) de um srcset, ignorando data:; null se não houver. */
function largestFromSrcset(srcset: string | null): string | null {
  if (!srcset) return null;
  let best: { url: string; score: number } | null = null;
  for (const c of parseSrcset(srcset)) {
    if (isData(c.url)) continue;
    if (!best || c.score > best.score) best = c;
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
    if (!chosen && (!img.getAttribute('src')?.trim() || isData(img.getAttribute('src')!)) && img.parentElement?.localName === 'picture') {
      for (const s of Array.from(img.parentElement.querySelectorAll('source'))) {
        chosen = largestFromSrcset(s.getAttribute('srcset')) ?? largestFromSrcset(s.getAttribute('data-srcset'));
        if (chosen) break;
      }
    }
    const own = img.getAttribute('src');
    const src = chosen ?? own;
    if (src) img.setAttribute('src', absolute(src, baseUrl));
    for (const a of ['srcset', 'sizes', 'data-srcset']) img.removeAttribute(a);
  }
}
