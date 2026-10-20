const SUFFIXES = ['read online free', 'read online', 'read free', 'read now', 'online free', 'free online'];
const SEP = /\s+[-–—|:·]\s+/;

/** Remove sufixos genéricos ("- Read Online") do fim do título; nunca devolve vazio. */
export function cleanTitle(t: string): string {
  const original = t.trim();
  let cur = original;
  for (;;) {
    const m = [...cur.matchAll(new RegExp(SEP, 'g'))].pop();
    if (!m || m.index === undefined) break;
    const tail = cur.slice(m.index + m[0].length).trim().toLowerCase();
    if (!SUFFIXES.includes(tail)) break;
    cur = cur.slice(0, m.index).trim();
  }
  return cur || original;
}
