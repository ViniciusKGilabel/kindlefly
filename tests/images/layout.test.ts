import { expect, test } from 'vitest';
import {
  IMAGE_MAX_WIDTH,
  PAGE_ASPECT,
  isBlankRow,
  sliceRanges,
  targetSize,
} from '../../src/images/layout';

const noBlanks = () => false;

test('constantes da spec', () => {
  expect(IMAGE_MAX_WIDTH).toBe(1236);
  expect(PAGE_ASPECT).toBeCloseTo(1648 / 1236, 10);
});

test('targetSize nunca amplia e mantém imagens já pequenas', () => {
  expect(targetSize(900, 16000)).toEqual({ width: 900, height: 16000 });
});

test('targetSize reduz para a largura máxima mantendo a proporção', () => {
  expect(targetSize(2472, 1000)).toEqual({ width: 1236, height: 500 });
});

test('isBlankRow: linha uniforme é lisa, ruído não é', () => {
  expect(isBlankRow(new Uint8ClampedArray(900).fill(200))).toBe(true);
  expect(isBlankRow(new Uint8ClampedArray(900).fill(0))).toBe(true);
  const noise = Array.from({ length: 900 }, (_, i) => (i % 2 ? 0 : 255));
  expect(isBlankRow(noise)).toBe(false);
});

test('isBlankRow: linha vazia é lisa; desvio-padrão populacional < 6', () => {
  expect(isBlankRow([])).toBe(true);
  // média 100, desvio populacional 5 (valores 95 e 105 alternados) → lisa
  expect(isBlankRow([95, 105, 95, 105])).toBe(true);
  // média 100, desvio populacional 7 (valores 93 e 107) → não lisa
  expect(isBlankRow([93, 107, 93, 107])).toBe(false);
});

test('sliceRanges: altura até 1.25P vira uma fatia', () => {
  // P = round(900 × 1648/1236) = 1200; 1.25P = 1500
  expect(sliceRanges(1100, 900, noBlanks)).toEqual([[0, 1100]]);
  expect(sliceRanges(1500, 900, noBlanks)).toEqual([[0, 1500]]);
});

test('sliceRanges: tira 900×16000 sem faixas lisas corta em 1200 e cobre tudo', () => {
  const ranges = sliceRanges(16000, 900, noBlanks);
  expect(ranges[0]?.[0]).toBe(0);
  expect(ranges[ranges.length - 1]?.[1]).toBe(16000);
  for (let i = 0; i < ranges.length; i++) {
    const [start, end] = ranges[i]!;
    expect(end).toBeGreaterThan(start);
    if (i > 0) expect(start).toBe(ranges[i - 1]![1]);
    if (i < ranges.length - 1) expect(end - start).toBe(1200);
  }
  const last = ranges[ranges.length - 1]!;
  expect(last[1] - last[0]).toBeGreaterThanOrEqual(300);
});

test('sliceRanges: corta nas faixas lisas em 1100 e 2250', () => {
  const blanks = new Set([1100, 2250]);
  const ranges = sliceRanges(16000, 900, (y) => blanks.has(y));
  expect(ranges[0]).toEqual([0, 1100]);
  expect(ranges[1]).toEqual([1100, 2250]);
  expect(ranges[2]?.[0]).toBe(2250);
});

test('sliceRanges: intervalos contíguos, não vazios e cobrindo [0, height)', () => {
  const blanks = new Set([700, 1950, 3100, 4400]);
  const height = 9000;
  const ranges = sliceRanges(height, 900, (y) => blanks.has(y));
  expect(ranges[0]?.[0]).toBe(0);
  expect(ranges[ranges.length - 1]?.[1]).toBe(height);
  for (let i = 0; i < ranges.length; i++) {
    const [start, end] = ranges[i]!;
    expect(end).toBeGreaterThan(start);
    if (i > 0) expect(start).toBe(ranges[i - 1]![1]);
  }
});
