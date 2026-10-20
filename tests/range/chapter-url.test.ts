import { describe, expect, test } from 'vitest';
import { RANGE_MAX, chapterUrl, parseChapterUrl, validateRange } from '../../src/range/chapter-url';

describe('parseChapterUrl', () => {
  test('último segmento numérico', () => {
    const c = parseChapterUrl('https://site.example/novels/x/chapter/450')!;
    expect(c.prefix).toBe('');
    expect(c.number).toBe(450);
    expect(c.base).toBe('https://site.example/novels/x/chapter/');
  });
  test('prefixo no segmento e barra final', () => {
    const c = parseChapterUrl('https://site.example/n/chapter-450/')!;
    expect(c.prefix).toBe('chapter-');
    expect(c.number).toBe(450);
    expect(chapterUrl(c, 451)).toBe('https://site.example/n/chapter-451');
  });
  test('ignora query e hash', () => {
    const c = parseChapterUrl('https://site.example/n/chapter/450?x=1#y')!;
    expect(c.number).toBe(450);
    expect(chapterUrl(c, 452)).toBe('https://site.example/n/chapter/452');
  });
  test('preserva zeros à esquerda', () => {
    const c = parseChapterUrl('https://site.example/n/ch/007')!;
    expect(c.number).toBe(7);
    expect(chapterUrl(c, 8)).toBe('https://site.example/n/ch/008');
    expect(chapterUrl(c, 12)).toBe('https://site.example/n/ch/012');
  });
  test('não reconhecidas', () => {
    expect(parseChapterUrl('https://site.example/n/chapter/abc')).toBeNull();
    expect(parseChapterUrl('chrome://settings/1')).toBeNull();
    expect(parseChapterUrl(undefined)).toBeNull();
    expect(parseChapterUrl('not a url')).toBeNull();
    expect(parseChapterUrl('https://site.example/')).toBeNull();
  });
});

describe('validateRange', () => {
  test('casos', () => {
    expect(validateRange(450, 460)).toBe('ok');
    expect(validateRange(5, 5)).toBe('ok');
    expect(validateRange(10, 9)).toBe('invalid');
    expect(validateRange(1.5, 3)).toBe('invalid');
    expect(validateRange(Number.NaN, 3)).toBe('invalid');
    expect(validateRange(1, 101)).toBe('too_many');
    expect(validateRange(1, RANGE_MAX)).toBe('ok');
  });
});
