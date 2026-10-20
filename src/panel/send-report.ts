type T = (key: string, subs?: string[]) => string;

/** "N arquivo(s) enviado(s) para X", com "M grande(s) demais" quando houver. */
export function sentText(r: { sent: number; to: string; tooLarge: number }, t: T): string {
  return r.tooLarge > 0
    ? t('sentSomeTooLarge', [String(r.sent), r.to, String(r.tooLarge)])
    : t('sentCount', [String(r.sent), r.to]);
}

/** Erro do envio; se alguns arquivos já tinham ido, diz quantos (para não reenviar tudo às cegas). */
export function sendFailedText(base: string, sentBefore: number, t: T): string {
  return sentBefore > 0 ? `${base} ${t('sentBeforeError', [String(sentBefore)])}` : base;
}

/** Aviso de imagens e itens que não puderam ser incluídos (os dois juntos). */
export function exportNotice(r: { failedImages: number; failedItems: string[] }, t: T): string | null {
  const parts: string[] = [];
  if (r.failedImages > 0) parts.push(t('imagesFailed', [String(r.failedImages)]));
  if (r.failedItems.length > 0) parts.push(t('itemsFailed', [r.failedItems.join(', ')]));
  return parts.length > 0 ? parts.join(' · ') : null;
}
