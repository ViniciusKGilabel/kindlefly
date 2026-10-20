import { describe, expect, it } from 'vitest';
import { isRelevantUpdate } from '../../src/panel/tab-watch';

describe('isRelevantUpdate', () => {
  it('aba ativa com URL nova', () => {
    expect(isRelevantUpdate({ url: 'https://a.com/2' }, { active: true })).toBe(true);
  });
  it('aba ativa terminou de carregar', () => {
    expect(isRelevantUpdate({ status: 'complete' }, { active: true })).toBe(true);
  });
  it('aba ativa ainda carregando, sem URL nova', () => {
    expect(isRelevantUpdate({ status: 'loading' }, { active: true })).toBe(false);
  });
  it('aba em segundo plano é ignorada', () => {
    expect(isRelevantUpdate({ url: 'https://a.com/2', status: 'complete' }, { active: false })).toBe(false);
  });
});
