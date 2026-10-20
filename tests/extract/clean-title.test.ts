import { expect, test } from 'vitest';
import { cleanTitle } from '../../src/extract/clean-title';

test('remove sufixos genéricos', () => {
  expect(cleanTitle('Shadow Slave Chapter 450 - Read Online')).toBe('Shadow Slave Chapter 450');
  expect(cleanTitle('X – Read Online Free')).toBe('X');
  expect(cleanTitle('X — Read Free')).toBe('X');
  expect(cleanTitle('X | Read Now')).toBe('X');
  expect(cleanTitle('X : Free Online')).toBe('X');
  expect(cleanTitle('X · Online Free')).toBe('X');
  expect(cleanTitle('x - read online')).toBe('x');
});
test('repete enquanto houver', () => {
  expect(cleanTitle('X | Read Online - Free Online')).toBe('X');
  expect(cleanTitle('X - Read Online | Read Now')).toBe('X');
});
test('sem sufixo ou no meio fica igual', () => {
  expect(cleanTitle('Capítulo 1')).toBe('Capítulo 1');
  expect(cleanTitle('How to Read Online Safely')).toBe('How to Read Online Safely');
});
test('nunca vazio', () => {
  expect(cleanTitle('Read Online')).toBe('Read Online');
  expect(cleanTitle('  - Read Online ')).toBe('- Read Online');
});
