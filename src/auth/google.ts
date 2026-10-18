import { browser } from 'wxt/browser';
import { KfError } from '../core/errors';

export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'] as const;

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
/** Tokens que expiram em menos que isto são tratados como expirados. */
const REFRESH_MARGIN_MS = 60_000;

export function buildAuthUrl(o: {
  clientId: string;
  redirectUri: string;
  nonce: string;
  mode: 'select' | 'silent';
  loginHint?: string;
}): string {
  const p = new URLSearchParams();
  p.set('client_id', o.clientId);
  p.set('redirect_uri', o.redirectUri);
  p.set('response_type', 'token id_token');
  p.set('scope', GOOGLE_SCOPES.join(' '));
  p.set('nonce', o.nonce);
  p.set('prompt', o.mode === 'silent' ? 'none' : 'select_account');
  if (o.loginHint) p.set('login_hint', o.loginHint);
  return `${AUTH_ENDPOINT}?${p.toString()}`;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split('.')[1];
  if (!part) throw new KfError('auth_failed', 'malformed id_token');
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = JSON.parse(new TextDecoder().decode(bytes));
    if (json === null || typeof json !== 'object') throw new Error('not an object');
    return json as Record<string, unknown>;
  } catch {
    throw new KfError('auth_failed', 'malformed id_token');
  }
}

export function parseAuthRedirect(
  redirectUrl: string,
  expectedNonce: string,
  now: number,
): { accessToken: string; expiresAt: number; email: string } {
  const hashIdx = redirectUrl.indexOf('#');
  const params = new URLSearchParams(hashIdx >= 0 ? redirectUrl.slice(hashIdx + 1) : '');
  const error = params.get('error');
  if (error) {
    throw new KfError(error === 'access_denied' ? 'auth_cancelled' : 'auth_failed', error);
  }
  const accessToken = params.get('access_token');
  const idToken = params.get('id_token');
  if (!accessToken || !idToken) throw new KfError('auth_failed', 'missing token in redirect');

  const payload = decodeJwtPayload(idToken);
  if (payload.nonce !== expectedNonce) throw new KfError('auth_failed', 'nonce mismatch');
  const email = payload.email;
  if (typeof email !== 'string' || !email) throw new KfError('auth_failed', 'missing email');

  const expiresIn = Number(params.get('expires_in'));
  const seconds = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
  return { accessToken, expiresAt: now + seconds * 1000, email };
}

export interface IdentityLike {
  launchWebAuthFlow(o: { url: string; interactive: boolean }): Promise<string | undefined>;
  getRedirectURL(): string;
}

export interface AuthStorage {
  getToken(): Promise<{ accessToken: string; expiresAt: number } | null>;
  setToken(t: { accessToken: string; expiresAt: number } | null): Promise<void>;
  getEmail(): Promise<string | null>;
  setEmail(e: string | null): Promise<void>;
}

export class GoogleAuth {
  constructor(
    private d: {
      identity: IdentityLike;
      storage: AuthStorage;
      clientId: string;
      now: () => number;
      fetchFn: typeof fetch;
    },
  ) {}

  /** Uma tentativa de login. Não toca no estado guardado; quem chama decide. */
  private async attempt(mode: 'select' | 'silent', loginHint?: string) {
    if (!this.d.clientId) throw new KfError('auth_failed', 'client id not configured');
    const nonce = crypto.randomUUID();
    const url = buildAuthUrl({
      clientId: this.d.clientId,
      redirectUri: this.d.identity.getRedirectURL(),
      nonce,
      mode,
      loginHint,
    });
    let redirectUrl: string | undefined;
    try {
      redirectUrl = await this.d.identity.launchWebAuthFlow({ url, interactive: mode === 'select' });
    } catch (e) {
      throw new KfError('auth_cancelled', e instanceof Error ? e.message : undefined);
    }
    if (!redirectUrl) throw new KfError('auth_cancelled', 'no redirect');
    return parseAuthRedirect(redirectUrl, nonce, this.d.now());
  }

  private async store(r: { accessToken: string; expiresAt: number; email: string }): Promise<void> {
    await this.d.storage.setToken({ accessToken: r.accessToken, expiresAt: r.expiresAt });
    await this.d.storage.setEmail(r.email);
  }

  async connect(): Promise<string> {
    const r = await this.attempt('select');
    await this.store(r);
    return r.email;
  }

  async getToken(): Promise<string> {
    const email = await this.d.storage.getEmail();
    if (!email) throw new KfError('not_connected');
    const t = await this.d.storage.getToken();
    if (t && t.expiresAt - this.d.now() >= REFRESH_MARGIN_MS) return t.accessToken;

    let r;
    try {
      r = await this.attempt('silent', email);
    } catch (e) {
      // Sem client id não há o que tentar; qualquer outra falha cai para UMA tentativa interativa.
      if (e instanceof KfError && e.message.includes('client id not configured')) throw e;
      r = await this.attempt('select', email);
    }
    await this.store(r);
    return r.accessToken;
  }

  async invalidate(): Promise<void> {
    await this.d.storage.setToken(null);
  }

  async disconnect(): Promise<void> {
    const t = await this.d.storage.getToken();
    try {
      if (t) {
        await this.d.fetchFn(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(t.accessToken)}`, {
          method: 'POST',
        });
      }
    } catch {
      // Falha de rede na revogação não impede limpar o estado local.
    } finally {
      await this.d.storage.setToken(null);
      await this.d.storage.setEmail(null);
    }
  }

  connectedEmail(): Promise<string | null> {
    return this.d.storage.getEmail();
  }
}

const TOKEN_KEY = 'kf.auth.token';
const EMAIL_KEY = 'kf.auth.email';

export function createChromeAuthStorage(): AuthStorage {
  return {
    async getToken() {
      const r = await browser.storage.session.get(TOKEN_KEY);
      return (r[TOKEN_KEY] as { accessToken: string; expiresAt: number } | undefined) ?? null;
    },
    async setToken(t) {
      if (t) await browser.storage.session.set({ [TOKEN_KEY]: t });
      else await browser.storage.session.remove(TOKEN_KEY);
    },
    async getEmail() {
      const r = await browser.storage.local.get(EMAIL_KEY);
      return (r[EMAIL_KEY] as string | undefined) ?? null;
    },
    async setEmail(e) {
      if (e) await browser.storage.local.set({ [EMAIL_KEY]: e });
      else await browser.storage.local.remove(EMAIL_KEY);
    },
  };
}

export function createGoogleAuth(): GoogleAuth {
  return new GoogleAuth({
    identity: browser.identity,
    storage: createChromeAuthStorage(),
    clientId: import.meta.env.WXT_GOOGLE_CLIENT_ID ?? '',
    now: Date.now,
    fetchFn: (...a) => fetch(...a),
  });
}
