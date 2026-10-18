import { describe, expect, test, vi } from 'vitest';
import {
  GoogleAuth,
  buildAuthUrl,
  parseAuthRedirect,
  type AuthStorage,
  type IdentityLike,
} from '../../src/auth/google';

const REDIRECT = 'https://abc.chromiumapp.org/';

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function idToken(payload: Record<string, unknown>): string {
  return `${b64url({ alg: 'RS256' })}.${b64url(payload)}.sig`;
}
function redirect(o: { nonce: string; email: string; token?: string; expiresIn?: number }): string {
  const p = new URLSearchParams({
    access_token: o.token ?? 'tok',
    expires_in: String(o.expiresIn ?? 3600),
    token_type: 'Bearer',
    id_token: idToken({ email: o.email, nonce: o.nonce }),
  });
  return `${REDIRECT}#${p.toString()}`;
}

function memStorage(init?: { token?: { accessToken: string; expiresAt: number }; email?: string }) {
  let token = init?.token ?? null;
  let email = init?.email ?? null;
  const s: AuthStorage = {
    getToken: async () => token,
    setToken: async (t) => void (token = t),
    getEmail: async () => email,
    setEmail: async (e) => void (email = e),
  };
  return s;
}

/** Identity fake: responde com o nonce presente na URL pedida. */
function fakeIdentity(
  handler: (url: URL, interactive: boolean, call: number) => string | undefined | Error,
) {
  const calls: { url: URL; interactive: boolean }[] = [];
  const identity: IdentityLike = {
    getRedirectURL: () => REDIRECT,
    launchWebAuthFlow: async ({ url, interactive }) => {
      const u = new URL(url);
      calls.push({ url: u, interactive });
      const r = handler(u, interactive, calls.length);
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return { identity, calls };
}

const NOW = 1_000_000;
const mk = (identity: IdentityLike, storage: AuthStorage, fetchFn: typeof fetch = vi.fn() as never, clientId = 'cid') =>
  new GoogleAuth({ identity, storage, clientId, now: () => NOW, fetchFn });

describe('buildAuthUrl', () => {
  test('select: host, path e cada parâmetro exatos', () => {
    const u = new URL(buildAuthUrl({ clientId: 'cid', redirectUri: REDIRECT, nonce: 'n1', mode: 'select' }));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: 'cid',
      redirect_uri: REDIRECT,
      response_type: 'token id_token',
      scope: 'openid email https://www.googleapis.com/auth/gmail.send',
      nonce: 'n1',
      prompt: 'select_account',
    });
  });
  test('silent: prompt=none e login_hint', () => {
    const u = new URL(
      buildAuthUrl({ clientId: 'cid', redirectUri: REDIRECT, nonce: 'n1', mode: 'silent', loginHint: 'a@b.com' }),
    );
    expect(u.searchParams.get('prompt')).toBe('none');
    expect(u.searchParams.get('login_hint')).toBe('a@b.com');
  });
  test('select com loginHint também envia login_hint', () => {
    const u = new URL(
      buildAuthUrl({ clientId: 'cid', redirectUri: REDIRECT, nonce: 'n1', mode: 'select', loginHint: 'a@b.com' }),
    );
    expect(u.searchParams.get('prompt')).toBe('select_account');
    expect(u.searchParams.get('login_hint')).toBe('a@b.com');
  });
});

describe('parseAuthRedirect', () => {
  test('token, expiresAt = now + expires_in*1000, e-mail do id_token', () => {
    const r = parseAuthRedirect(redirect({ nonce: 'n', email: 'u@gmail.com', token: 'T', expiresIn: 100 }), 'n', NOW);
    expect(r).toEqual({ accessToken: 'T', expiresAt: NOW + 100_000, email: 'u@gmail.com' });
  });
  test('decodifica base64url com -, _ e sem padding', () => {
    const email = 'ñ?>>~~@gmail.com'; // gera caracteres '-' e '_' no base64url
    const r = parseAuthRedirect(redirect({ nonce: 'n', email }), 'n', NOW);
    expect(r.email).toBe(email);
  });
  test('error=access_denied → auth_cancelled', () => {
    expect(() => parseAuthRedirect(`${REDIRECT}#error=access_denied`, 'n', NOW)).toThrowError(/^auth_cancelled/);
  });
  test('error na query (?error=access_denied) → auth_cancelled', () => {
    expect(() => parseAuthRedirect(`${REDIRECT}?error=access_denied`, 'n', NOW)).toThrowError(/^auth_cancelled/);
  });
  test('outro error → auth_failed', () => {
    expect(() => parseAuthRedirect(`${REDIRECT}#error=login_required`, 'n', NOW)).toThrowError(/^auth_failed/);
  });
  test('nonce errado → auth_failed', () => {
    expect(() => parseAuthRedirect(redirect({ nonce: 'x', email: 'u@g.com' }), 'n', NOW)).toThrowError(/^auth_failed/);
  });
  test('sem fragmento / sem token → auth_failed', () => {
    expect(() => parseAuthRedirect(REDIRECT, 'n', NOW)).toThrowError(/^auth_failed/);
  });
});

describe('GoogleAuth', () => {
  const echo = (email = 'u@gmail.com', token = 'new') => (u: URL) =>
    redirect({ nonce: u.searchParams.get('nonce')!, email, token });

  test('connect ok: guarda token e e-mail, mode select interativo', async () => {
    const { identity, calls } = fakeIdentity(echo());
    const st = memStorage();
    expect(await mk(identity, st).connect()).toBe('u@gmail.com');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.interactive).toBe(true);
    expect(calls[0]!.url.searchParams.get('prompt')).toBe('select_account');
    expect(calls[0]!.url.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(await st.getEmail()).toBe('u@gmail.com');
    expect((await st.getToken())?.accessToken).toBe('new');
  });

  test('connect: janela fechada (launchWebAuthFlow rejeita) → auth_cancelled, estado intacto', async () => {
    const { identity } = fakeIdentity(() => new Error('The user did not approve access.'));
    const st = memStorage({ email: 'old@g.com' });
    await expect(mk(identity, st).connect()).rejects.toMatchObject({ code: 'auth_cancelled' });
    expect(await st.getEmail()).toBe('old@g.com');
    expect(await st.getToken()).toBeNull();
  });

  test('connect: undefined → auth_cancelled', async () => {
    const { identity } = fakeIdentity(() => undefined);
    await expect(mk(identity, memStorage()).connect()).rejects.toMatchObject({ code: 'auth_cancelled' });
  });

  test('sem clientId: auth_failed sem abrir janela', async () => {
    const { identity, calls } = fakeIdentity(echo());
    const a = mk(identity, memStorage({ email: 'u@g.com' }), undefined, '');
    await expect(a.connect()).rejects.toMatchObject({ code: 'auth_failed' });
    await expect(a.getToken()).rejects.toMatchObject({ code: 'auth_failed' });
    expect(calls).toHaveLength(0);
  });

  test('getToken sem conta → not_connected', async () => {
    const { identity, calls } = fakeIdentity(echo());
    await expect(mk(identity, memStorage()).getToken()).rejects.toMatchObject({ code: 'not_connected' });
    expect(calls).toHaveLength(0);
  });

  test('getToken válido → devolve sem janela', async () => {
    const { identity, calls } = fakeIdentity(echo());
    const st = memStorage({ email: 'u@g.com', token: { accessToken: 'ok', expiresAt: NOW + 120_000 } });
    expect(await mk(identity, st).getToken()).toBe('ok');
    expect(calls).toHaveLength(0);
  });

  test('getToken faltando < 60 s conta como expirado', async () => {
    const { identity, calls } = fakeIdentity(echo('u@g.com', 'fresh'));
    const st = memStorage({ email: 'u@g.com', token: { accessToken: 'old', expiresAt: NOW + 59_000 } });
    expect(await mk(identity, st).getToken()).toBe('fresh');
    expect(calls).toHaveLength(1);
  });

  test('getToken expirado: renovação silenciosa ok → sem janela interativa', async () => {
    const { identity, calls } = fakeIdentity(echo('u@g.com', 'fresh'));
    const st = memStorage({ email: 'u@g.com', token: { accessToken: 'old', expiresAt: NOW - 1 } });
    expect(await mk(identity, st).getToken()).toBe('fresh');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.interactive).toBe(false);
    expect(calls[0]!.url.searchParams.get('prompt')).toBe('none');
    expect(calls[0]!.url.searchParams.get('login_hint')).toBe('u@g.com');
  });

  test('opções do launchWebAuthFlow: silenciosa estendida, interativa sem elas', async () => {
    const opts: Record<string, unknown>[] = [];
    const identity: IdentityLike = {
      getRedirectURL: () => REDIRECT,
      launchWebAuthFlow: async (o) => {
        opts.push(o as never);
        if (!o.interactive) throw new Error('x');
        return redirect({ nonce: new URL(o.url).searchParams.get('nonce')!, email: 'u@g.com' });
      },
    };
    await mk(identity, memStorage({ email: 'u@g.com' })).getToken();
    const { url: _u1, ...silent } = opts[0]!;
    const { url: _u2, ...inter } = opts[1]!;
    expect(silent).toEqual({ interactive: false, abortOnLoadForNonInteractive: false, timeoutMsForNonInteractive: 10_000 });
    expect(inter).toEqual({ interactive: true });
  });

  test('getToken sem token guardado (sessão nova) com e-mail → renova', async () => {
    const { identity } = fakeIdentity(echo('u@g.com', 'fresh'));
    expect(await mk(identity, memStorage({ email: 'u@g.com' })).getToken()).toBe('fresh');
  });

  test('getToken: silenciosa falha → exatamente 1 interativa com login_hint; sucesso atualiza e-mail', async () => {
    const { identity, calls } = fakeIdentity((u, interactive) =>
      interactive ? echo('new@g.com', 'fresh')(u) : new Error('interaction required'),
    );
    const st = memStorage({ email: 'u@g.com' });
    expect(await mk(identity, st).getToken()).toBe('fresh');
    expect(calls.map((c) => c.interactive)).toEqual([false, true]);
    expect(calls[1]!.url.searchParams.get('prompt')).toBe('select_account');
    expect(calls[1]!.url.searchParams.get('login_hint')).toBe('u@g.com');
    expect(await st.getEmail()).toBe('new@g.com');
  });

  test('getToken: silenciosa e interativa falham → lança, sem loop (2 chamadas)', async () => {
    const { identity, calls } = fakeIdentity(() => new Error('nope'));
    const st = memStorage({ email: 'u@g.com' });
    await expect(mk(identity, st).getToken()).rejects.toMatchObject({ code: 'auth_cancelled' });
    expect(calls).toHaveLength(2);
    expect(await st.getEmail()).toBe('u@g.com');
  });

  test('getToken: interativa devolve nonce errado → auth_failed', async () => {
    const { identity, calls } = fakeIdentity((u, i) =>
      i ? redirect({ nonce: 'bad', email: 'u@g.com' }) : new Error('x'),
    );
    await expect(mk(identity, memStorage({ email: 'u@g.com' })).getToken()).rejects.toMatchObject({
      code: 'auth_failed',
    });
    expect(calls).toHaveLength(2);
  });

  test('nonce é único por tentativa', async () => {
    const { identity, calls } = fakeIdentity(echo());
    const a = mk(identity, memStorage());
    await a.connect();
    await a.connect();
    expect(calls[0]!.url.searchParams.get('nonce')).not.toBe(calls[1]!.url.searchParams.get('nonce'));
  });

  test('invalidate descarta o token mas mantém o e-mail', async () => {
    const { identity } = fakeIdentity(echo());
    const st = memStorage({ email: 'u@g.com', token: { accessToken: 'x', expiresAt: NOW + 1e6 } });
    await mk(identity, st).invalidate();
    expect(await st.getToken()).toBeNull();
    expect(await st.getEmail()).toBe('u@g.com');
  });

  test('disconnect: revoga e limpa', async () => {
    const { identity } = fakeIdentity(echo());
    const st = memStorage({ email: 'u@g.com', token: { accessToken: 'a b', expiresAt: NOW + 1e6 } });
    const fetchFn = vi.fn(async () => new Response('{}')) as unknown as typeof fetch;
    const a = mk(identity, st, fetchFn);
    await a.disconnect();
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('https://oauth2.googleapis.com/revoke?token=a%20b');
    expect(init.method).toBe('POST');
    expect(await st.getToken()).toBeNull();
    expect(await a.connectedEmail()).toBeNull();
  });

  test('disconnect: limpa mesmo se a revogação der erro de rede', async () => {
    const { identity } = fakeIdentity(echo());
    const st = memStorage({ email: 'u@g.com', token: { accessToken: 'a', expiresAt: NOW + 1e6 } });
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(mk(identity, st, fetchFn).disconnect()).resolves.toBeUndefined();
    expect(await st.getToken()).toBeNull();
    expect(await st.getEmail()).toBeNull();
  });
});
