import type { GoogleAuth } from '../auth/google';
import { KfError } from '../core/errors';
import type { EpubFile } from '../core/types';
import { EMAIL_DELAY_MS, groupForEmails } from './batch';
import { buildMimeMessage } from './mime';

const SEND_URL = 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media';

type AuthLike = Pick<GoogleAuth, 'getToken' | 'invalidate' | 'connectedEmail'>;

export function isKindleAddress(s: string): boolean {
  return /^[^\s@]+@kindle\.com$/i.test(s.trim());
}

async function post(raw: string, token: string, fetchFn: typeof fetch): Promise<Response> {
  try {
    return await fetchFn(SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'message/rfc822' },
      body: raw,
    });
  } catch {
    throw new KfError('network');
  }
}

function check(res: Response): void {
  if (!res.ok) throw new KfError('gmail_error', `status ${res.status}`, res.status);
}

export async function sendRawMessage(raw: string, token: string, fetchFn: typeof fetch): Promise<void> {
  check(await post(raw, token, fetchFn));
}

/** Sends with a fresh token; on a 401 invalidates, renews and retries once. */
export async function sendWithRetry(
  raw: string,
  auth: Pick<GoogleAuth, 'getToken' | 'invalidate'>,
  fetchFn: typeof fetch,
): Promise<void> {
  let res = await post(raw, await auth.getToken(), fetchFn);
  if (res.status === 401) {
    await auth.invalidate();
    res = await post(raw, await auth.getToken(), fetchFn);
  }
  check(res);
}

export async function sendToKindle(
  files: EpubFile[],
  d: { auth: AuthLike; kindleAddress: string | null; fetchFn: typeof fetch; subject: string;
    sleep?: (ms: number) => Promise<void>;
    onProgress?: (sent: number, total: number) => void;
    /** Chamado após cada e-mail enviado, com os arquivos que ele levou. */
    onSent?: (files: EpubFile[]) => void;
  },
): Promise<{ emailsSent: number; tooLarge: string[] }> {
  if (!d.kindleAddress || !d.kindleAddress.trim()) throw new KfError('kindle_address_missing');
  if (!isKindleAddress(d.kindleAddress)) throw new KfError('kindle_address_invalid');
  const from = await d.auth.connectedEmail();
  if (!from) throw new KfError('not_connected');
  const to = d.kindleAddress.trim().toLowerCase();

  const { groups, tooLarge } = groupForEmails(files.map((f) => ({ size: f.data.length })));
  const tooLargeNames = tooLarge.map((i) => files[i]!.filename);
  let emailsSent = 0;
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  if (groups.length > 0) d.onProgress?.(0, groups.length);
  for (const g of groups) {
    if (emailsSent > 0) await sleep(EMAIL_DELAY_MS);
    const attachments = g.map((i) => files[i]!);
    const raw = buildMimeMessage({ from, to, subject: d.subject, attachments });
    await sendWithRetry(raw, d.auth, d.fetchFn);
    emailsSent++;
    d.onSent?.(attachments);
    d.onProgress?.(emailsSent, groups.length);
  }
  return { emailsSent, tooLarge: tooLargeNames };
}
