# kindlefly — Plano 1: Fundação e envio pelo Gmail

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extensão carregável que extrai o artigo da aba atual, gera um EPUB válido (sem imagens) e envia para o Kindle pelo Gmail da conta que o usuário escolher — provando de ponta a ponta a parte que falhou na tentativa anterior.

**Architecture:** Extensão MV3 feita com WXT. O painel lateral (React) é onde tudo roda: ele injeta um script de extração na aba (Readability), converte o HTML em capítulos XHTML, monta o EPUB com JSZip e envia pela Gmail API usando um token obtido via `chrome.identity.launchWebAuthFlow`. O service worker só configura o painel. Lógica pura (EPUB, MIME, URL de auth, agrupamento) fica em módulos sem dependência de `chrome.*`, testados com Vitest; código que toca `chrome.*` recebe dependências injetadas.

**Tech Stack:** WXT 0.21, TypeScript, React 19, @mozilla/readability 0.6, JSZip 3.10, Vitest 5 (+ jsdom), epubcheck 5.2.1 (Java 17, só em teste), pnpm.

**Spec:** `.curator/SPEC.md`

**Este é o plano 1 de 4.** Os próximos (escritos depois que este estiver entregue):
- **Plano 2 — Fila e painel completo:** fila em IndexedDB, menu de contexto (página/seleção), extração contínua, exportar "um por item" / "juntar em um", editor rico TipTap, remover itens, layout final do painel.
- **Plano 3 — Imagens e mangá:** download paralelo, conversão/compressão, detecção de mangá, corte de tiras verticais, `Referer` para sites com bloqueio de hotlink.
- **Plano 4 — Acabamento:** traduções completas, todas as mensagens de erro, teste ponta a ponta com Playwright, auditoria de rede (critério 9).

## Global Constraints

- Chrome Manifest V3; só Chrome. Painel via `chrome.sidePanel`.
- Nenhum servidor próprio. Único serviço externo: Google (OAuth + Gmail API), só ao conectar/enviar.
- Escopos OAuth exatamente: `openid`, `email`, `https://www.googleapis.com/auth/gmail.send`. Nenhum outro.
- Login com `chrome.identity.launchWebAuthFlow` (nunca `getAuthToken`); `redirect_uri` = `chrome.identity.getRedirectURL()`.
- `key` fixa no manifest (ID estável). `keys/*.pem` nunca vai para o git.
- Token de acesso só em `chrome.storage.session`; e-mail conectado e endereço Kindle em `chrome.storage.local`.
- EPUB 3 com `nav.xhtml` e `toc.ncx`; `mimetype` primeiro e sem compressão; XHTML bem formado; todo EPUB gerado passa no epubcheck.
- Endereço Kindle válido: termina em `@kindle.com`.
- Limite por e-mail: `GMAIL_MAX_MESSAGE_BYTES = 25 * 1024 * 1024` (tamanho da mensagem MIME codificada); máximo `KINDLE_MAX_ATTACHMENTS = 25` anexos por e-mail.
- Toda string visível vem de `public/_locales/{pt_BR,en,es}/messages.json`; `default_locale` = `en`.
- Não copiar nome, logo, textos ou código da extensão original. Sem links de doação.

## Review Focus

1. **Título com acentos, emoji, `/` ou `:`** → nome de arquivo seguro e nome do anexo correto no e-mail (RFC 2231). Teste na Task 2 (`sanitizeFilename`) e na Task 5 (`encodeFilenameRfc2231`).
2. **Página sem nenhum título (H1–H6)** → o sumário ainda é válido, com uma entrada com o título do artigo. Teste na Task 2.
3. **HTML sujo** (`&nbsp;`, tags não fechadas, `onclick`, links `javascript:`, `<iframe>`, `<form>`) → XHTML válido e sem nada executável. Teste na Task 3.
4. **Usuário fecha a janela do Google ou nega o consentimento** → erro `auth_cancelled` com mensagem clara, e o painel continua usável. Teste na Task 4.
5. **Token expirado e renovação silenciosa falha** (usuário saiu da conta) → cai para login interativo **uma vez**, sem loop. Teste na Task 4.

---

## Estrutura de arquivos

```
wxt.config.ts                 manifest (key, permissões, locales), módulos WXT
vitest.config.ts
scripts/gen-key.mjs           gera keys/kindlefly.pem e imprime a chave pública + ID
scripts/epubcheck.mjs         baixa (cache em .cache/) e roda epubcheck num arquivo
docs/setup-google-oauth.md    passo a passo Google Cloud + Amazon
public/_locales/{pt_BR,en,es}/messages.json
src/core/types.ts             tipos compartilhados
src/core/errors.ts            KfError + ErrorCode
src/core/i18n.ts              t(key, subs?)
src/core/filename.ts          sanitizeFilename
src/epub/build.ts             buildEpub(book) → Uint8Array
src/epub/templates.ts         container.xml, content.opf, nav.xhtml, toc.ncx, chapter xhtml
src/epub/toc.ts               nestHeadings
src/extract/to-chapter.ts     htmlToChapter (roda no painel, tem DOM)
src/auth/google.ts            buildAuthUrl, parseAuthRedirect, GoogleAuth
src/send/mime.ts              buildMimeMessage, encodeFilenameRfc2231
src/send/batch.ts             estimateMimeBytes, groupForEmails
src/send/gmail.ts             sendRawMessage, sendToKindle, isKindleAddress
src/settings/store.ts         getKindleAddress/setKindleAddress
entrypoints/background.ts     setPanelBehavior
entrypoints/extract.ts        script injetado: Readability na aba
entrypoints/sidepanel/{index.html,main.tsx,App.tsx,Settings.tsx,Main.tsx,styles.css}
tests/...                     espelha src/
tests/fixtures/*.html
```

## Tipos compartilhados (`src/core/types.ts`)

```ts
export interface ExtractedItem {
  id: string;            // crypto.randomUUID()
  sourceUrl: string;
  title: string;
  author: string;        // byline || siteName || hostname
  language: string;      // lang do documento || 'en'
  html: string;          // conteúdo do Readability
  kind: 'article' | 'selection';
}
export interface Heading { level: 1 | 2 | 3 | 4 | 5 | 6; text: string; anchor: string }
export interface Chapter { id: string; title: string; xhtmlBody: string; headings: Heading[] }
export interface EpubImage { href: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif'; data: Uint8Array }
export interface Book {
  title: string; author: string; language: string;
  identifier: string;    // 'urn:uuid:' + uuid
  modified: Date;
  chapters: Chapter[];
  images: EpubImage[];   // vazio no plano 1
}
export interface EpubFile { filename: string; data: Uint8Array }
```

`src/core/errors.ts`:

```ts
export type ErrorCode =
  | 'not_connected' | 'auth_cancelled' | 'auth_failed'
  | 'kindle_address_missing' | 'kindle_address_invalid'
  | 'too_large' | 'network' | 'gmail_error' | 'extract_failed';
export class KfError extends Error { constructor(public code: ErrorCode, detail?: string) }
```

Cada `ErrorCode` tem a chave `error_<code>` nos três locales.

---

### Task 1: Esqueleto da extensão, ID fixo e i18n

**Files:**
- Create: `package.json`, `wxt.config.ts`, `vitest.config.ts`, `tsconfig.json`, `.gitignore` (acrescentar), `scripts/gen-key.mjs`, `entrypoints/background.ts`, `entrypoints/sidepanel/{index.html,main.tsx,App.tsx}`, `public/_locales/{pt_BR,en,es}/messages.json`, `src/core/{types.ts,errors.ts,i18n.ts}`
- Test: `tests/core/locales.test.ts`

**Interfaces:**
- Produces: `t(key: string, subs?: string[]): string` (envolve `browser.i18n.getMessage`, devolve a própria chave se vazia); tipos e `KfError` acima; env `WXT_GOOGLE_CLIENT_ID` lido em `import.meta.env`.

- [ ] **Step 1:** `pnpm dlx wxt@0.21.4 init . -t react --pm pnpm` (pasta já tem arquivos do curator — mantê-los). Adicionar `vitest@5`, `jsdom`, `@mozilla/readability@0.6.0`, `jszip@3.10.2`.
- [ ] **Step 2:** `scripts/gen-key.mjs`: com `node:crypto` gera RSA 2048, grava `keys/kindlefly.pem` (não sobrescreve se existir), imprime a chave pública DER em base64 (vai no `manifest.key`) e o ID da extensão (SHA-256 da DER, 32 primeiros hex mapeados `0-f → a-p`). Rodar; colar a chave pública em `wxt.config.ts`. Acrescentar `keys/` e `.env*.local` ao `.gitignore`.
- [ ] **Step 3:** `wxt.config.ts` manifest: `name: '__MSG_extName__'`, `description: '__MSG_extDescription__'`, `default_locale: 'en'`, `key`, `permissions: ['sidePanel','storage','identity','scripting','tabs']`, `host_permissions: ['<all_urls>']`, `side_panel.default_path` = sidepanel. `background.ts`: `browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`.
- [ ] **Step 4: Write the failing test** `tests/core/locales.test.ts`:

```ts
test('os três locales têm exatamente as mesmas chaves', () => {
  const keys = (l: string) => Object.keys(readJson(`public/_locales/${l}/messages.json`)).sort();
  expect(keys('pt_BR')).toEqual(keys('en'));
  expect(keys('es')).toEqual(keys('en'));
});
test('toda chave error_<code> existe para cada ErrorCode', () => {
  for (const code of ALL_ERROR_CODES) expect(keys('en')).toContain(`error_${code}`);
});
```
(exportar `ALL_ERROR_CODES: readonly ErrorCode[]` de `errors.ts`.)
- [ ] **Step 5:** Run `pnpm vitest run tests/core/locales.test.ts` → FAIL (arquivos ausentes).
- [ ] **Step 6:** Criar os três `messages.json` com `extName` ("kindlefly"), `extDescription` e as chaves `error_*`. Painel placeholder mostra `t('extName')`.
- [ ] **Step 7:** Run `pnpm vitest run` → PASS. Run `pnpm wxt build` → sem erros; `.output/chrome-mv3/manifest.json` contém `key`.
- [ ] **Step 8 (manual):** carregar `.output/chrome-mv3` sem empacotar; o ID em `chrome://extensions` é igual ao impresso pelo `gen-key`; clicar no ícone abre o painel. Remover e recarregar: ID igual.
- [ ] **Step 9: Commit** `feat: esqueleto WXT com ID fixo e locales`

---

### Task 2: Gerador de EPUB

**Files:**
- Create: `src/epub/{build.ts,templates.ts,toc.ts}`, `src/core/filename.ts`, `scripts/epubcheck.mjs`
- Test: `tests/epub/build.test.ts`, `tests/epub/toc.test.ts`, `tests/epub/epubcheck.test.ts`, `tests/core/filename.test.ts`

**Interfaces:**
- Consumes: `Book`, `Chapter`, `Heading` (Task 1).
- Produces: `buildEpub(book: Book): Promise<Uint8Array>`; `nestHeadings(h: Heading[]): TocNode[]` com `TocNode = { text: string; anchor: string; children: TocNode[] }`; `sanitizeFilename(title: string): string` (sem extensão); script `pnpm epubcheck <arquivo>` (exit ≠ 0 em erro).

Layout do zip: `mimetype` (STORE, primeiro) · `META-INF/container.xml` · `OEBPS/content.opf` · `OEBPS/nav.xhtml` · `OEBPS/toc.ncx` · `OEBPS/style.css` · `OEBPS/chapters/c{N}.xhtml` (N a partir de 1) · `OEBPS/images/*`. Âncora no sumário: `chapters/c{N}.xhtml#{anchor}`.

Sumário: com 1 capítulo, as entradas de topo são os headings dele; com 2+, cada capítulo é uma entrada (link `chapters/cN.xhtml`) com os headings aninhados embaixo. Sem headings, uma entrada com o título do capítulo.

- [ ] **Step 1: Write failing tests**

```ts
// toc.test.ts
test('aninha por nível, pulando níveis', () => {
  expect(nestHeadings([h(1,'A'), h(3,'B'), h(2,'C'), h(1,'D')])).toEqual([
    node('A', [node('B'), node('C')]), node('D'),
  ]);
});
// build.test.ts (abre o resultado com JSZip)
test('mimetype é a primeira entrada, sem compressão, conteúdo exato', ...) // 'application/epub+zip'
test('opf tem título, autor, idioma, identificador e dcterms:modified', ...)
test('capítulo sem headings gera nav e ncx com uma entrada = título', ...)
test('2 capítulos: nav tem 2 entradas de topo com headings aninhados', ...)
test('caracteres especiais no título (& < " ação 📚) ficam escapados no opf/nav', ...)
// filename.test.ts
expect(sanitizeFilename('A/B: C? "D" | ação 📚')).toBe('A B C D ação 📚');
expect(sanitizeFilename('   ')).toBe('kindlefly');
expect(sanitizeFilename('x'.repeat(300)).length).toBe(120);
// epubcheck.test.ts — pula (test.skipIf) se `java` não existir
test('livro de 2 capítulos com títulos e entidades passa no epubcheck', ...)
```
- [ ] **Step 2:** Run `pnpm vitest run tests/epub tests/core/filename.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `nestHeadings` (pilha por nível), `templates.ts` (funções que retornam strings XML, todo texto passa por `escapeXml`), `buildEpub` (JSZip; `mimetype` com `compression: 'STORE'`; resto DEFLATE), `sanitizeFilename` (remove `/\\?%*:|"<>` e controles, colapsa espaços, trim, corta em 120, fallback `kindlefly`). `scripts/epubcheck.mjs` baixa `epubcheck-5.2.1.zip` do release oficial do GitHub para `.cache/` (gitignored) e roda `java -jar`.
- [ ] **Step 4:** Run `pnpm vitest run` → PASS (inclusive epubcheck).
- [ ] **Step 5: Commit** `feat: gerador de EPUB 3 com nav e ncx`

---

### Task 3: Extração e conversão para capítulo

**Files:**
- Create: `entrypoints/extract.ts`, `src/extract/to-chapter.ts`, `src/extract/readability.ts`
- Test: `tests/extract/readability.test.ts`, `tests/extract/to-chapter.test.ts`, `tests/fixtures/{blog-post.html,no-headings.html,dirty.html}`

**Interfaces:**
- Consumes: `ExtractedItem`, `Chapter`, `Heading`, `KfError`.
- Produces:
  - `extractFromDocument(doc: Document, url: string): Omit<ExtractedItem, 'id'>` em `readability.ts` (lança `KfError('extract_failed')` se Readability devolver `null`).
  - `entrypoints/extract.ts`: `defineUnlistedScript(() => extractFromDocument(document.cloneNode(true) as Document, location.href))` — o painel roda via `browser.scripting.executeScript({ target: { tabId }, files: ['/extract.js'] })` e lê `result`.
  - `htmlToChapter(html: string, opts: { id: string; title: string }): Chapter` em `to-chapter.ts` (usa `DOMParser`/`XMLSerializer` do painel).

Regras de `htmlToChapter`: remove `script, style, iframe, form, input, button, object, embed, noscript, img, picture, svg, video, audio` (imagens voltam no plano 3); remove atributos `on*`, `style`, `class`, `id` originais; remove `href` que não comece com `http:`/`https:`/`#`; prepende `<h1>` com o título se o conteúdo não começar com um H1 igual; atribui `id="h-{n}"` a cada H1–H6 e coleta `headings`; serializa os filhos do body com `XMLSerializer` (XHTML).

- [ ] **Step 1: Write failing tests**

```ts
// readability.test.ts (jsdom com fixtures)
test('blog-post: título, autor (byline), idioma e conteúdo sem nav/aside', ...)
test('sem byline: autor = siteName, senão hostname', ...)
test('página sem artigo → KfError extract_failed', ...)
// to-chapter.test.ts
test('dirty.html vira XHTML que o DOMParser em application/xhtml+xml aceita sem parsererror', ...)
test('remove onclick, javascript:, iframe, form, script, img', ...)
test('&nbsp; e tags não fechadas não quebram', ...)
test('headings recebem h-1, h-2… e voltam em ordem com nível e texto', ...)
test('prepende h1 com o título quando ausente; não duplica quando presente', ...)
```
- [ ] **Step 2:** Run `pnpm vitest run tests/extract` → FAIL.
- [ ] **Step 3:** Implementar conforme as regras acima.
- [ ] **Step 4:** Run `pnpm vitest run` → PASS.
- [ ] **Step 5: Commit** `feat: extração com Readability e conversão para XHTML`

---

### Task 4: Login Google (escolha de conta + renovação silenciosa)

**Files:**
- Create: `src/auth/google.ts`
- Test: `tests/auth/google.test.ts`

**Interfaces:**
- Consumes: `KfError`.
- Produces:

```ts
export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'] as const;
export function buildAuthUrl(o: { clientId: string; redirectUri: string; nonce: string;
  mode: 'select' | 'silent'; loginHint?: string }): string;
export function parseAuthRedirect(redirectUrl: string, expectedNonce: string, now: number):
  { accessToken: string; expiresAt: number; email: string };
export interface IdentityLike { launchWebAuthFlow(o: { url: string; interactive: boolean }): Promise<string | undefined>; getRedirectURL(): string }
export interface AuthStorage { getToken(): Promise<{ accessToken: string; expiresAt: number } | null>;
  setToken(t: { accessToken: string; expiresAt: number } | null): Promise<void>;
  getEmail(): Promise<string | null>; setEmail(e: string | null): Promise<void> }
export class GoogleAuth {
  constructor(d: { identity: IdentityLike; storage: AuthStorage; clientId: string;
    now: () => number; fetchFn: typeof fetch });
  connect(): Promise<string>;        // interativo, mode 'select'; devolve e-mail
  getToken(): Promise<string>;       // válido; renova se faltar < 60 s
  invalidate(): Promise<void>;       // descarta o token (usado em 401)
  disconnect(): Promise<void>;       // revoga + limpa token e e-mail
  connectedEmail(): Promise<string | null>;
}
export function createChromeAuthStorage(): AuthStorage; // session p/ token, local p/ e-mail
```

URL: `https://accounts.google.com/o/oauth2/v2/auth` com `client_id`, `redirect_uri`, `response_type=token id_token`, `scope` (espaço-separado), `nonce`, e `prompt=select_account` (mode `select`) ou `prompt=none` + `login_hint` (mode `silent`). Resposta vem no **fragmento** (`#access_token=…&expires_in=…&id_token=…`); e-mail e nonce saem do payload do `id_token` (base64url). Fragmento com `error=access_denied` ou `launchWebAuthFlow` rejeitado/undefined → `auth_cancelled`; nonce diferente ou outro `error` → `auth_failed`.

`getToken()`: token válido → devolve. Senão, com e-mail conectado: tenta `silent` (`interactive: false`); se falhar, **uma** tentativa interativa (`select` com `login_hint`); se o e-mail mudar, atualiza. Sem e-mail conectado → `not_connected`. Revogação em `disconnect`: `POST https://oauth2.googleapis.com/revoke?token=…`; falha de rede na revogação não impede limpar o estado local.

- [ ] **Step 1: Write failing tests**

```ts
test('buildAuthUrl select: host, path e cada parâmetro exatos', () => {
  const u = new URL(buildAuthUrl({ clientId: 'cid', redirectUri: 'https://abc.chromiumapp.org/', nonce: 'n1', mode: 'select' }));
  expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
  expect(Object.fromEntries(u.searchParams)).toEqual({
    client_id: 'cid', redirect_uri: 'https://abc.chromiumapp.org/', response_type: 'token id_token',
    scope: 'openid email https://www.googleapis.com/auth/gmail.send', nonce: 'n1', prompt: 'select_account' });
});
test('buildAuthUrl silent: prompt=none e login_hint', ...)
test('parseAuthRedirect: token, expiresAt = now + expires_in*1000, e-mail do id_token', ...)
test('parseAuthRedirect: error=access_denied → auth_cancelled; nonce errado → auth_failed', ...)
test('connect: janela fechada (launchWebAuthFlow rejeita) → auth_cancelled, estado intacto', ...)
test('getToken sem conta → not_connected', ...)
test('getToken expirado: renovação silenciosa ok → sem janela interativa', ...)
test('getToken expirado: silenciosa falha → exatamente 1 interativa; se essa falha, lança, sem loop', ...)
test('disconnect: revoga e limpa mesmo se a revogação der erro de rede', ...)
```
- [ ] **Step 2:** Run `pnpm vitest run tests/auth` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Run `pnpm vitest run` → PASS.
- [ ] **Step 5: Commit** `feat: login Google com escolha de conta e renovação silenciosa`

---

### Task 5: Envio pelo Gmail

**Files:**
- Create: `src/send/{mime.ts,batch.ts,gmail.ts}`, `src/settings/store.ts`
- Test: `tests/send/{mime.test.ts,batch.test.ts,gmail.test.ts}`

**Interfaces:**
- Consumes: `GoogleAuth` (Task 4), `EpubFile`, `KfError`.
- Produces:

```ts
// mime.ts
export function encodeFilenameRfc2231(name: string): string; // ASCII puro → filename="x"; senão filename*=UTF-8''%..
export function buildMimeMessage(m: { from: string; to: string; subject: string;
  attachments: EpubFile[]; boundary?: string }): string;
// batch.ts
export const GMAIL_MAX_MESSAGE_BYTES = 25 * 1024 * 1024;
export const KINDLE_MAX_ATTACHMENTS = 25;
export function estimateMimeBytes(rawBytes: number): number; // base64 com quebra a 76 colunas + 2048 de cabeçalhos
export function groupForEmails(files: { size: number }[]): { groups: number[][]; tooLarge: number[] }; // índices
// gmail.ts
export function isKindleAddress(s: string): boolean;
export async function sendRawMessage(raw: string, token: string, fetchFn: typeof fetch): Promise<void>;
export async function sendToKindle(files: EpubFile[], d: { auth: GoogleAuth; kindleAddress: string | null;
  fetchFn: typeof fetch; subject: string }): Promise<{ emailsSent: number; tooLarge: string[] }>;
// settings/store.ts
export function getKindleAddress(): Promise<string | null>;
export function setKindleAddress(v: string): Promise<void>; // trim + lowercase; lança kindle_address_invalid
```

MIME: `multipart/mixed`, cabeçalhos `From`, `To`, `Subject` (codificado `=?UTF-8?B?…?=` se não-ASCII), `MIME-Version: 1.0`; corpo texto curto; cada anexo `Content-Type: application/epub+zip; name=…`, `Content-Disposition: attachment; <filename RFC 2231>`, `Content-Transfer-Encoding: base64`, linhas de 76, CRLF. Envio: `POST https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media`, `Authorization: Bearer`, `Content-Type: message/rfc822`, corpo = MIME. 401 → `auth.invalidate()`, novo token, **uma** nova tentativa. Outras respostas ≠ 2xx → `gmail_error` (com status no detalhe); `fetch` rejeitado → `network`. `From` = `auth.connectedEmail()`.

Agrupamento: guloso na ordem, abre e-mail novo quando somar `estimateMimeBytes` passaria de `GMAIL_MAX_MESSAGE_BYTES` ou quando chegar a 25 anexos; arquivo que sozinho passa do limite vai para `tooLarge`.

- [ ] **Step 1: Write failing tests**

```ts
// mime.test.ts
expect(encodeFilenameRfc2231('book.epub')).toBe('filename="book.epub"');
expect(encodeFilenameRfc2231('ação 📚.epub')).toBe("filename*=UTF-8''a%C3%A7%C3%A3o%20%F0%9F%93%9A.epub");
test('mensagem: CRLF, boundary fixo, anexo base64 decodifica para os bytes originais', ...)
test('assunto não-ASCII vira encoded-word', ...)
// batch.test.ts
test('3 arquivos de 10 MB (≈13,5 MB codificados cada) → 3 e-mails: [[0],[1],[2]]', ...)
test('3 arquivos de 5 MB → 1 e-mail: [[0,1,2]]', ...)
test('30 arquivos pequenos → grupos de 25 e 5', ...)
test('arquivo de 20 MB → tooLarge', ...)
// gmail.test.ts (fetch e auth falsos)
test('isKindleAddress: aceita "Foo@Kindle.com " após trim; recusa @gmail.com e @kindle.com.br', ...)
test('sem endereço → kindle_address_missing; inválido → kindle_address_invalid; nada é enviado', ...)
test('POST no endpoint de upload com Bearer e message/rfc822', ...)
test('401 uma vez → invalida, renova, reenvia e conclui; 401 duas vezes → gmail_error', ...)
test('fetch rejeita → network', ...)
test('arquivos grandes demais voltam em tooLarge e os outros são enviados', ...)
```
- [ ] **Step 2:** Run `pnpm vitest run tests/send` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Run `pnpm vitest run` → PASS.
- [ ] **Step 5: Commit** `feat: envio de EPUB para o Kindle via Gmail API`

---

### Task 6: Painel mínimo ligando tudo + guia do Google Cloud

**Files:**
- Create: `entrypoints/sidepanel/{Settings.tsx,Main.tsx,styles.css}`, `src/panel/pipeline.ts`, `docs/setup-google-oauth.md`
- Modify: `entrypoints/sidepanel/App.tsx`, `public/_locales/*/messages.json`
- Test: `tests/panel/pipeline.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 2–5.
- Produces: `itemToEpub(item: ExtractedItem, edits: { title: string; author: string }): Promise<EpubFile>` em `pipeline.ts` (monta `Book` com 1 capítulo via `htmlToChapter`, `buildEpub`, nome = `sanitizeFilename(title) + '.epub'`). Plano 2 vai estender isso para a fila.

Painel (de cima para baixo, layout definitivo é do plano 2): ícone de engrenagem alterna para **Configurações** (endereço Kindle com validação ao salvar; "Conectar conta Google" / e-mail conectado + "Desconectar"; texto lembrando de autorizar o Gmail na lista "Approved Personal Document E-mail List" da Amazon). Tela **principal**: campos Título e Autor (preenchidos da extração), botões "Baixar EPUB" e "Enviar para o Kindle", prévia somente leitura do conteúdo. Ao abrir, o painel extrai a aba ativa (`tabs.query({active: true, currentWindow: true})` + `executeScript`). Download por `<a download>` com `URL.createObjectURL`. Estados visíveis: extraindo / enviando / enviado ("Enviado para <endereço>") / erro (`t('error_' + code)`). Toda string nova nos três locales.

- [ ] **Step 1: Write failing test** `pipeline.test.ts`: `itemToEpub` com título editado gera arquivo com nome `sanitizeFilename(título) + '.epub'`, opf com o título e autor editados, e o arquivo passa no epubcheck (skipIf sem java).
- [ ] **Step 2:** Run `pnpm vitest run tests/panel` → FAIL.
- [ ] **Step 3:** Implementar `pipeline.ts` e o painel.
- [ ] **Step 4:** Run `pnpm vitest run` → PASS; `pnpm wxt build` → sem erros.
- [ ] **Step 5:** Escrever `docs/setup-google-oauth.md`: criar projeto no Google Cloud; ativar Gmail API; tela de consentimento (Externo, modo Teste, escopos `openid`, `email`, `gmail.send`, adicionar testadores); credencial OAuth **Aplicativo da Web** com URI de redirecionamento `https://<ID impresso pelo gen-key>.chromiumapp.org/` (com a barra final); copiar o client ID para `.env.local` como `WXT_GOOGLE_CLIENT_ID`; na Amazon, adicionar o Gmail à "Approved Personal Document E-mail List" e copiar o endereço `@kindle.com`. Incluir seção "Se aparecer erro 404/400 no login" listando: redirect sem barra final, tipo de credencial errado, ID diferente do cadastrado, usuário não está na lista de testadores.
- [ ] **Step 6: Commit** `feat: painel mínimo com download e envio para o Kindle`
- [ ] **Step 7: CHECKPOINT HUMANO** — o dono segue `docs/setup-google-oauth.md` e verifica, com a extensão carregada sem empacotar:
  - Critério 1: conectar abre o consentimento do Google sem erro e mostra o e-mail.
  - Critério 10 (parte 1): conectar uma conta diferente da do perfil do Chrome funciona.
  - Critério 2 (sem imagens): enviar um post de blog → aparece na biblioteca do Kindle, legível, com sumário.
  - Critério 10 (parte 2): mais de 1 h depois, enviar de novo sem pedir login.
  - Baixar EPUB salva um arquivo que abre num leitor de EPUB.
  Resultado vai para `.curator/PROGRESS.md`. Só depois disso escrever o Plano 2.
