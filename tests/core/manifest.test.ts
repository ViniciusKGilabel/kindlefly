import { describe, expect, test } from 'vitest';
import config from '../../wxt.config';

const manifest = (config as { manifest: Record<string, any> }).manifest;

describe('manifest', () => {
  test('declara action (necessário para openPanelOnActionClick)', () => {
    expect(manifest.action).toBeDefined();
    expect(manifest.action.default_title).toBe('__MSG_extName__');
    expect(manifest.action.default_icon).toBeDefined();
  });

  test('declara ícones 16/32/48/128', () => {
    expect(Object.keys(manifest.icons).sort()).toEqual(['128', '16', '32', '48']);
  });
});
