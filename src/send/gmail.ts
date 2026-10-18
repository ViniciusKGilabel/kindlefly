import type { GoogleAuth } from '../auth/google';
import { KfError } from '../core/errors';
import type { EpubFile } from '../core/types';
import { groupForEmails } from './batch';
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

export async function sendRawMessage(
  raw: string,
  token: string,
  fetchFn: typeof fetch,
  auth?: Pick<GoogleAuth, 'getToken' | 'invalidate'>,
): Promise<void> {
  let res = await post(raw, token, fetchFn);
  if (res.status === 401 && auth) {
    await auth.invalidate();
    res = await post(raw, await auth.getToken(), fetchFn);
  }
  if (!res.ok) throw new KfError('gmail_error', `status ${res.status}`);
}

export async function sendToKindle(
  files: EpubFile[],
  d: { auth: AuthLike; kindleAddress: string | null; fetchFn: typeof fetch; subject: string },
): Promise<{ emailsSent: number; tooLarge: string[] }> {
  if (!d.kindleAddress || !d.kindleAddress.trim()) throw new KfError('kindle_address_missing');
  if (!isKindleAddress(d.kindleAddress)) throw new KfError('kindle_address_invalid');
  const from = await d.auth.connectedEmail();
  if (!from) throw new KfError('not_connected');
  const to = d.kindleAddress.trim().toLowerCase();

  const { groups, tooLarge } = groupForEmails(files.map((f) => ({ size: f.data.length })));
  const tooLargeNames = tooLarge.map((i) => files[i]!.filename);
  let emailsSent = 0;
  for (const g of groups) {
    const raw = buildMimeMessage({ from, to, subject: d.subject, attachments: g.map((i) => files[i]!) });
    await sendRawMessage(raw, await d.auth.getToken(), d.fetchFn, d.auth);
    emailsSent++;
  }
  return { emailsSent, tooLarge: tooLargeNames };
}
