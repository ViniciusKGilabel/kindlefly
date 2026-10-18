import { expect, test } from 'vitest';
import { estimateMimeBytes, groupForEmails } from '../../src/send/batch';

const MB = 1024 * 1024;
test('estimate ≈ 4/3 + quebras + 2048', () => {
  expect(estimateMimeBytes(10 * MB)).toBeGreaterThan(13.5 * MB);
});
test('3 arquivos de 10 MB → 3 e-mails', () => {
  expect(groupForEmails([{ size: 10 * MB }, { size: 10 * MB }, { size: 10 * MB }])).toEqual({
    groups: [[0], [1], [2]], tooLarge: [],
  });
});
test('3 arquivos de 5 MB → 1 e-mail', () => {
  expect(groupForEmails([{ size: 5 * MB }, { size: 5 * MB }, { size: 5 * MB }]).groups).toEqual([[0, 1, 2]]);
});
test('30 pequenos → 25 e 5', () => {
  const r = groupForEmails(Array.from({ length: 30 }, () => ({ size: 1000 })));
  expect(r.groups.map((g) => g.length)).toEqual([25, 5]);
});
test('20 MB → tooLarge', () => {
  expect(groupForEmails([{ size: 20 * MB }, { size: 1000 }])).toEqual({ groups: [[1]], tooLarge: [0] });
});
