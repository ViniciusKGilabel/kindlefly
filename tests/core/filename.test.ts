import { expect, test } from 'vitest';
import { sanitizeFilename } from '../../src/core/filename';

test('remove caracteres proibidos e preserva acentos e emoji', () => {
  expect(sanitizeFilename('A/B: C? "D" | ação 📚')).toBe('A B C D ação 📚');
});
test('vazio vira kindlefly', () => {
  expect(sanitizeFilename('   ')).toBe('kindlefly');
  expect(sanitizeFilename('///')).toBe('kindlefly');
});
test('corta em 120', () => {
  expect(sanitizeFilename('x'.repeat(300)).length).toBe(120);
});
test('remove controles', () => {
  expect(sanitizeFilename('a\u0000b\nc')).toBe('a b c');
});
