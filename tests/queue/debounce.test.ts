import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createDebouncedSaver } from '../../src/queue/debounce';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('agrupa chamadas e salva só o último valor após o intervalo', () => {
  const save = vi.fn();
  const d = createDebouncedSaver<number>(save, 400);
  d.schedule(1); d.schedule(2);
  vi.advanceTimersByTime(399);
  expect(save).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith(2);
});

test('flush salva já o pendente e não salva de novo depois', () => {
  const save = vi.fn();
  const d = createDebouncedSaver<number>(save, 400);
  d.schedule(5);
  d.flush();
  expect(save).toHaveBeenCalledWith(5);
  vi.advanceTimersByTime(1000);
  expect(save).toHaveBeenCalledTimes(1);
});

test('flush sem pendente não faz nada; saveNow cancela o pendente', () => {
  const save = vi.fn();
  const d = createDebouncedSaver<number>(save, 400);
  d.flush();
  expect(save).not.toHaveBeenCalled();
  d.schedule(1);
  d.saveNow(2);
  vi.advanceTimersByTime(1000);
  expect(save.mock.calls).toEqual([[2]]);
});
