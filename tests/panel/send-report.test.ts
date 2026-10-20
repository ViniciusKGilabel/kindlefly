import { expect, test } from 'vitest';
import { exportNotice, sendFailedText, sentText } from '../../src/panel/send-report';

const t = (k: string, s: string[] = []) => `${k}[${s.join('|')}]`;

test('sentText: tudo enviado', () => {
  expect(sentText({ sent: 2, to: 'a@kindle.com', tooLarge: 0 }, t)).toBe('sentCount[2|a@kindle.com]');
});

test('sentText: com arquivos grandes demais', () => {
  expect(sentText({ sent: 1, to: 'a@kindle.com', tooLarge: 2 }, t)).toBe('sentSomeTooLarge[1|a@kindle.com|2]');
});

test('sendFailedText: diz quantos já tinham ido', () => {
  expect(sendFailedText('Falhou', 0, t)).toBe('Falhou');
  expect(sendFailedText('Falhou', 3, t)).toBe('Falhou sentBeforeError[3]');
});

test('exportNotice: imagens e itens que falharam juntos, sem sobrescrever', () => {
  expect(exportNotice({ failedImages: 0, failedItems: [] }, t)).toBeNull();
  expect(exportNotice({ failedImages: 2, failedItems: [] }, t)).toBe('imagesFailed[2]');
  expect(exportNotice({ failedImages: 0, failedItems: ['A', 'B'] }, t)).toBe('itemsFailed[A, B]');
  expect(exportNotice({ failedImages: 1, failedItems: ['A'] }, t)).toBe('imagesFailed[1] · itemsFailed[A]');
});
