/** Salva com atraso (só o último valor); flush grava já o pendente. */
export function createDebouncedSaver<T>(save: (v: T) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { v: T } | null = null;
  function flush() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (pending) {
      const { v } = pending;
      pending = null;
      save(v);
    }
  }
  return {
    schedule(v: T) {
      pending = { v };
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(flush, ms);
    },
    saveNow(v: T) {
      pending = { v };
      flush();
    },
    flush,
  };
}
