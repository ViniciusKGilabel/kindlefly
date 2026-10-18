import type { Heading } from '../core/types';

export interface TocNode {
  text: string;
  anchor: string;
  children: TocNode[];
}

/** Aninha headings por nível usando uma pilha; níveis pulados (h1 → h3) viram filhos diretos. */
export function nestHeadings(headings: Heading[]): TocNode[] {
  const root: TocNode[] = [];
  const stack: { level: number; node: TocNode }[] = [];
  for (const h of headings) {
    const node: TocNode = { text: h.text, anchor: h.anchor, children: [] };
    while (stack.length && stack[stack.length - 1]!.level >= h.level) stack.pop();
    (stack.length ? stack[stack.length - 1]!.node.children : root).push(node);
    stack.push({ level: h.level, node });
  }
  return root;
}
