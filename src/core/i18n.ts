/** Mensagem localizada; devolve a própria chave se não existir. */
export function t(key: string, subs?: string[]): string {
  // getMessage é tipado com as chaves geradas pelo WXT; aqui aceitamos qualquer string.
  const getMessage = browser.i18n.getMessage as (key: string, subs?: string[]) => string;
  return getMessage(key, subs) || key;
}
