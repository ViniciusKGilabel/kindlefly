import { expect, test } from 'vitest';
import { getKindleAddress, setKindleAddress } from '../../src/settings/store';

function mem() {
  const d: Record<string, unknown> = {};
  return {
    get: async (k: string) => (k in d ? { [k]: d[k] } : {}),
    set: async (o: Record<string, unknown>) => { Object.assign(d, o); },
  };
}
test('guarda trim+lowercase e lê de volta', async () => {
  const s = mem();
  expect(await getKindleAddress(s)).toBeNull();
  await setKindleAddress(' Foo@Kindle.com ', s);
  expect(await getKindleAddress(s)).toBe('foo@kindle.com');
});
test('inválido lança kindle_address_invalid', async () => {
  await expect(setKindleAddress('a@gmail.com', mem())).rejects.toMatchObject({ code: 'kindle_address_invalid' });
});
