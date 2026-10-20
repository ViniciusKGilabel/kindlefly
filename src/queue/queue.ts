import type { ExtractedItem } from '../core/types';

export interface QueueItem extends ExtractedItem {
  /** Só em itens 'merged': um capítulo por item de origem. */
  parts?: { title: string; html: string; sourceUrl: string }[];
  selected: boolean;
  addedAt: number;
}

/** Adiciona à lista; mesma sourceUrl não duplica: seleciona o item existente. */
export function addItem(
  q: QueueItem[],
  e: Omit<ExtractedItem, 'id'>,
  now: number,
  id: string,
): { queue: QueueItem[]; id: string; duplicate: boolean } {
  const existing = q.find((i) => i.sourceUrl === e.sourceUrl);
  if (existing) {
    return { queue: setSelected(q, existing.id, true), id: existing.id, duplicate: true };
  }
  return { queue: [...q, { ...e, id, selected: true, addedAt: now }], id, duplicate: false };
}

export function removeItem(q: QueueItem[], id: string): QueueItem[] {
  return q.filter((i) => i.id !== id);
}

export function setSelected(q: QueueItem[], id: string, selected: boolean): QueueItem[] {
  return q.map((i) => (i.id === id ? { ...i, selected } : i));
}

export function setAllSelected(q: QueueItem[], selected: boolean): QueueItem[] {
  return q.map((i) => ({ ...i, selected }));
}

export function updateMeta(q: QueueItem[], id: string, m: { title?: string; author?: string }): QueueItem[] {
  return q.map((i) =>
    i.id === id
      ? { ...i, title: m.title ?? i.title, author: m.author ?? i.author }
      : i,
  );
}

export function selectedItems(q: QueueItem[]): QueueItem[] {
  return q.filter((i) => i.selected);
}
