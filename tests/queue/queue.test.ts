import { describe, expect, test } from 'vitest';
import {
  addItem, removeItem, selectedItems, setAllSelected, setSelected, updateMeta, type QueueItem,
} from '../../src/queue/queue';

const e = (url: string, title = 'T') => ({
  sourceUrl: url, title, author: 'A', language: 'en', html: '<p>x</p>', kind: 'article' as const,
});

describe('queue', () => {
  test('item novo entra selecionado, com id e addedAt', () => {
    const r = addItem([], e('https://a.com/1'), 100, 'id1');
    expect(r.duplicate).toBe(false);
    expect(r.id).toBe('id1');
    expect(r.queue).toHaveLength(1);
    expect(r.queue[0]).toMatchObject({ id: 'id1', selected: true, addedAt: 100, sourceUrl: 'https://a.com/1' });
  });

  test('duplicado por sourceUrl não duplica, seleciona e devolve o id existente', () => {
    let q = addItem([], e('https://a.com/1'), 1, 'id1').queue;
    q = setSelected(q, 'id1', false);
    const r = addItem(q, e('https://a.com/1'), 2, 'id2');
    expect(r.duplicate).toBe(true);
    expect(r.id).toBe('id1');
    expect(r.queue).toHaveLength(1);
    expect(r.queue[0]!.selected).toBe(true);
  });

  test('removeItem', () => {
    let q = addItem([], e('u1'), 1, 'a').queue;
    q = addItem(q, e('u2'), 2, 'b').queue;
    expect(removeItem(q, 'a').map((i) => i.id)).toEqual(['b']);
  });

  test('setSelected e setAllSelected', () => {
    let q = addItem([], e('u1'), 1, 'a').queue;
    q = addItem(q, e('u2'), 2, 'b').queue;
    q = setSelected(q, 'a', false);
    expect(q.map((i) => i.selected)).toEqual([false, true]);
    expect(setAllSelected(q, true).every((i) => i.selected)).toBe(true);
    expect(setAllSelected(q, false).some((i) => i.selected)).toBe(false);
  });

  test('updateMeta altera só o que foi passado', () => {
    const q = addItem([], e('u1', 'Old'), 1, 'a').queue;
    expect(updateMeta(q, 'a', { title: 'New' })[0]).toMatchObject({ title: 'New', author: 'A' });
    expect(updateMeta(q, 'a', { author: 'Z' })[0]).toMatchObject({ title: 'Old', author: 'Z' });
  });

  test('selectedItems mantém a ordem da lista', () => {
    let q: QueueItem[] = [];
    for (const [i, id] of ['a', 'b', 'c'].entries()) q = addItem(q, e('u' + i), i, id).queue;
    q = setSelected(q, 'b', false);
    expect(selectedItems(q).map((i) => i.id)).toEqual(['a', 'c']);
  });

  test('não muta a entrada', () => {
    const q = addItem([], e('u1'), 1, 'a').queue;
    const snap = JSON.stringify(q);
    setSelected(q, 'a', false); updateMeta(q, 'a', { title: 'x' }); removeItem(q, 'a');
    expect(JSON.stringify(q)).toBe(snap);
  });
});
