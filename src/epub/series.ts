export interface Series {
  name: string;
  position: number;
}

const VOLUME_SUFFIX = /\s*\(vol\.\s*\d+\)\s*$/i;
const SERIES_TITLE =
  /^(.*?)[\s\-–—:|·]*(?:\b(?:chapter|chap\.?|ch\.?|cap[ií]tulo|cap\.?|episode|ep\.?|epis[oó]dio)\s*)?#?(\d+(?:\.\d+)?)(?:\s*[–~-]\s*\d+(?:\.\d+)?)?$/i;

/**
 * "Shadow Slave Chapter 450" → { name: 'Shadow Slave', position: 450 }. Para o Kindle ligar
 * os capítulos como uma série. Livro juntado ("… 10–11") fica na posição do primeiro.
 */
export function seriesFromTitle(title: string): Series | null {
  const m = SERIES_TITLE.exec(title.trim().replace(VOLUME_SUFFIX, ''));
  if (!m) return null;
  const name = m[1]!.replace(/[\s\-–—:|·]+$/, '').trim();
  if (!/\p{L}/u.test(name)) return null;
  return { name, position: Number(m[2]) };
}
