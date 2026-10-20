export const GMAIL_MAX_MESSAGE_BYTES = 25 * 1024 * 1024;
export const KINDLE_MAX_ATTACHMENTS = 10;
export const EMAIL_DELAY_MS = 5000;

// Headers + part headers; generous so that long RFC 2231-folded filenames
// (up to ~120 emoji, twice) are always covered.
const PER_FILE_OVERHEAD = 6144;

export function estimateMimeBytes(rawBytes: number): number {
  const b64 = Math.ceil(rawBytes / 3) * 4;
  return b64 + Math.ceil(b64 / 76) * 2 + PER_FILE_OVERHEAD;
}

export function groupForEmails(files: { size: number }[]): { groups: number[][]; tooLarge: number[] } {
  const groups: number[][] = [];
  const tooLarge: number[] = [];
  let cur: number[] = [];
  let curBytes = 0;
  files.forEach((f, i) => {
    const est = estimateMimeBytes(f.size);
    if (est > GMAIL_MAX_MESSAGE_BYTES) {
      tooLarge.push(i);
      return;
    }
    if (cur.length > 0 && (curBytes + est > GMAIL_MAX_MESSAGE_BYTES || cur.length >= KINDLE_MAX_ATTACHMENTS)) {
      groups.push(cur);
      cur = [];
      curBytes = 0;
    }
    cur.push(i);
    curBytes += est;
  });
  if (cur.length) groups.push(cur);
  return { groups, tooLarge };
}
