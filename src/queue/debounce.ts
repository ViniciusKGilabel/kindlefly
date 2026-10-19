/** Salva com atraso (só o último valor); flush/saveNow gravam já e devolvem a promise do save. */
export function createDebouncedSaver<T>(save: (v: T) => void | Promise<void>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { v: T } | null = null;
  function flush(): Promise<void> {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (!pending) return Promise.resolve();
    const { v } = pending;
    pending = null;
    return Promise.resolve(save(v));
  }
  return {
    schedule(v: T) {
      pending = { v };
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => void flush(), ms);
    },
    saveNow(v: T): Promise<void> {
      pending = { v };
      return flush();
    },
    flush,
  };
}
