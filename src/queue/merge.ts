import type { QueueItem } from './queue';

const NUM = /^(.*?)(\d+)(\D*)$/;

export function mergeTitle(titles: string[]): string {
  const ms = titles.map((t) => NUM.exec(t.trim()));
  if (ms.length > 0 && ms.every((m) => m)) {
    const pre = ms[0]![1]!.trim();
    const suf = ms[0]![3]!;
    if (ms.every((m) => m![1]!.trim() === pre && m![3] === suf)) {
      const strs = ms.map((m) => m![2]!);
      const nums = strs.map(Number);
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      if (min === max) return titles[0]!;
      return `${pre} ${strs[nums.indexOf(min)]}–${strs[nums.indexOf(max)]}${suf}`.replace(/\s+/g, ' ').trim();
    }
  }
  return `${titles[0] ?? ''} (+${titles.length - 1})`;
}

/** Junta itens (na ordem dada) em um item 'merged'; merged de entrada são expandidos. */
export function mergeItems(items: QueueItem[], id: string, now: number): QueueItem {
  const parts = items.flatMap((i) =>
    i.kind === 'merged' && i.parts
      ? i.parts
      : [{ title: i.title, html: i.html, sourceUrl: i.sourceUrl }],
  );
  const first = items[0]!;
  return {
    id,
    sourceUrl: 'merged:' + id,
    title: mergeTitle(parts.map((p) => p.title)),
    author: first.author,
    language: first.language,
    html: '',
    kind: 'merged',
    parts,
    selected: true,
    addedAt: now,
  };
}
