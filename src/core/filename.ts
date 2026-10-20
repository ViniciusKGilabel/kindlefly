const MAX_LENGTH = 120;

/** Nome de arquivo seguro (sem extensão) a partir do título. */
export function sanitizeFilename(title: string): string {
  const clean = title
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\?%*:|"<>\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const cut = Array.from(clean).slice(0, MAX_LENGTH).join('').trim();
  return cut || 'kindlefly';
}
