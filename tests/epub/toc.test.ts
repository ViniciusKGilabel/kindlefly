import { expect, test } from 'vitest';
import { nestHeadings, type TocNode } from '../../src/epub/toc';
import type { Heading } from '../../src/core/types';

const h = (level: Heading['level'], text: string): Heading => ({ level, text, anchor: `a-${text}` });
const node = (text: string, children: TocNode[] = []): TocNode => ({ text, anchor: `a-${text}`, children });

test('aninha por nível, pulando níveis', () => {
  expect(nestHeadings([h(1, 'A'), h(3, 'B'), h(2, 'C'), h(1, 'D')])).toEqual([
    node('A', [node('B'), node('C')]),
    node('D'),
  ]);
});

test('lista vazia gera lista vazia', () => {
  expect(nestHeadings([])).toEqual([]);
});

test('primeiro heading mais fundo que os seguintes continua no topo', () => {
  expect(nestHeadings([h(3, 'A'), h(1, 'B'), h(2, 'C')])).toEqual([node('A'), node('B', [node('C')])]);
});
