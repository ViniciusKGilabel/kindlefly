import { expect, test } from 'vitest';
import { getGrayscale, setGrayscale } from '../../src/settings/store';

function mem() {
  const d: Record<string, unknown> = {};
  return {
    get: async (k: string) => (k in d ? { [k]: d[k] } : {}),
    set: async (o: Record<string, unknown>) => { Object.assign(d, o); },
  };
}
test('padrão é true', async () => {
  expect(await getGrayscale(mem())).toBe(true);
});
test('round-trip false e true', async () => {
  const s = mem();
  await setGrayscale(false, s);
  expect(await getGrayscale(s)).toBe(false);
  await setGrayscale(true, s);
  expect(await getGrayscale(s)).toBe(true);
});
