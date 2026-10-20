# kindlefly — Plano 3: Imagens e quadrinhos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Artigos e capítulos levam as imagens para o EPUB (convertidas para JPEG, redimensionadas, tiras longas cortadas em páginas), e páginas de quadrinho/webtoon viram EPUBs de imagens, inclusive pelo intervalo de capítulos.

**Architecture:** A extração continua produzindo `ExtractedItem`, agora com URLs de imagens: artigos guardam `<img>` com marcadores `kf-img:N` no capítulo; quadrinhos guardam a lista ordenada `images`. Na hora de exportar, o painel baixa as imagens (fetch com `host_permissions`), decodifica com `createImageBitmap`, redimensiona e corta em `OffscreenCanvas`, codifica JPEG e entrega `EpubImage[]` ao `buildEpub`. Matemática de tamanho/corte é pura e testada com Vitest; a parte de canvas é testada ponta a ponta com Playwright num Chromium com a extensão carregada.

**Tech Stack:** o do projeto + `@playwright/test` (Chromium do Playwright, `channel: 'chromium'`, extensão via `--load-extension`).

**Spec:** `.curator/SPEC.md` (itens 7 e 8; critérios 3 e 6). Plano anterior: `docs/superpowers/plans/2026-10-18-kindlefly-p1-envio-gmail.md`.

**Contexto real:** `https://asurascans.com/comics/limitless-predation-11fe7da3/chapter/10` — HTML renderizado no servidor; ~17 `<img data-page-index="N" alt="Page N - Chapter 10 - …">` em ordem, WebP em `cdn.asurascans.com` (baixa sem `Referer`), maioria 900×16000 px (tiras), algumas 900×800. Não salvar conteúdo desse site no repositório.

## Global Constraints

- Imagens no EPUB: só `image/jpeg` (PNG/GIF/WebP/AVIF/SVG de origem viram JPEG; SVG é descartado).
- `IMAGE_MAX_WIDTH = 1236` px (nunca ampliar); `PAGE_ASPECT = 1648 / 1236`; cortar só se `altura > largura × PAGE_ASPECT × 1.25`.
- JPEG com `JPEG_QUALITY = 0.8`; **tons de cinza é uma opção** nas Configurações ("Imagens em tons de cinza", chave `kf.grayscale` em `chrome.storage.local`), **ligada por padrão** (Kindle do dono é preto e branco).
- `IMAGE_CONCURRENCY = 4` downloads simultâneos; `IMAGE_MAX_BYTES = 20 * 1024 * 1024` por imagem baixada (maior → descartada).
- Imagem que falha (HTTP, decodificação, tamanho) é removida do capítulo; a exportação continua e o painel avisa quantas falharam.
- Nenhum servidor além do Google e das páginas/imagens que o usuário pediu. Strings nos 3 locales. Todo EPUB passa no epubcheck.
- Não quebrar: lista, intervalo, juntar, envio em lotes (T-0007..T-0009).

## Review Focus

1. Tira de 900×16000 → ~9 fatias de 900×1200, cortes em faixas lisas quando existirem, sem perder linhas. Teste na Task 1 e na Task 6.
2. WebP/AVIF/PNG transparente → JPEG com fundo branco (transparência não pode virar preto). Task 2 / Task 6.
3. Imagem 404 ou não-imagem (HTML de erro) → removida, EPUB válido, contagem de falhas exibida. Task 3 / Task 5.
4. Imagens lazy (`data-src`, `data-lazy-src`, `data-original`, `srcset`) e relativas → URL absoluta certa. Task 3.
5. Página com logo/capa/avatar além das páginas do quadrinho → só as páginas entram, na ordem. Task 4.

---

### Task 1: Matemática de tamanho e corte (puro)

**Files:** Create `src/images/layout.ts`; Test `tests/images/layout.test.ts`.

**Interfaces — Produces:**
```ts
export const IMAGE_MAX_WIDTH = 1236; export const PAGE_ASPECT = 1648 / 1236; export const JPEG_QUALITY = 0.8;
export function targetSize(w: number, h: number): { width: number; height: number };   // escala p/ largura ≤ IMAGE_MAX_WIDTH, arredonda, nunca amplia
export function isBlankRow(luma: Uint8ClampedArray | number[]): boolean;                 // desvio-padrão < 6 (faixa lisa de qualquer cor)
export function sliceRanges(height: number, width: number, blankRows: (y: number) => boolean): Array<[number, number]>;
```
`sliceRanges`: altura de página `P = round(width × PAGE_ASPECT)`; se `height ≤ P × 1.25` → `[[0, height]]`. Senão, a partir de `y0`, corte ideal em `y0 + P`; procure de baixo para cima, entre `y0 + 0.75P` e `y0 + P`, a linha `y` com `blankRows(y)` mais próxima de `y0 + P`; sem nenhuma, corte em `y0 + P`. Última fatia menor que `0.25P` é anexada à anterior. Intervalos contíguos, cobrem `[0, height)`.

- [ ] Testes: `targetSize(900,16000)` = `{900,16000}`; `targetSize(2472,1000)` = `{1236,500}`; 900×1100 → 1 fatia; 900×16000 sem faixas → fatias de 1200, contíguas, cobrindo tudo, última ≥ 300 (ou anexada); com faixas lisas em 1100 e 2250 → cortes nelas; `isBlankRow` uniforme true, ruído false.
- [ ] RED → implementar → GREEN → commit `feat(images): matemática de redimensionamento e corte`.

### Task 2: Conversão no navegador

**Files:** Create `src/images/convert.ts`, `src/images/fetch-image.ts`; Test `tests/images/fetch-image.test.ts`.

**Interfaces:**
```ts
export async function fetchImageBlob(url: string, fetchFn: typeof fetch, signal?: AbortSignal): Promise<Blob>; // não-2xx, content-type não image/*, > IMAGE_MAX_BYTES → throw KfError('image_failed', motivo)
export async function toKindleJpegs(blob: Blob, opts: { grayscale: boolean }): Promise<Array<{ data: Uint8Array; width: number; height: number }>>;
```
`toKindleJpegs`: `createImageBitmap(blob)` → `targetSize` → para cada fatia de `sliceRanges` (luma das linhas lida de um `OffscreenCanvas` em escala reduzida é aceitável) desenha num `OffscreenCanvas` com fundo branco (`fillRect` antes do `drawImage`), aplica cinza só se `opts.grayscale` (`ctx.filter = 'grayscale(1)'`), `convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })`. Configuração: `getGrayscale(): Promise<boolean>` (padrão `true`) e `setGrayscale(v: boolean)` em `src/settings/store.ts`; checkbox "Imagens em tons de cinza" em `Settings.tsx` (3 locales). Novo `ErrorCode` `image_failed` (+ `error_image_failed` nos 3 locales).

- [ ] Testes de `getGrayscale`/`setGrayscale` (padrão true, round-trip).
- [ ] Testes unitários de `fetchImageBlob` (fetch falso: 404, `text/html`, tamanho grande, ok). `toKindleJpegs` é coberto na Task 6 (e2e).
- [ ] RED → implementar → GREEN → commit `feat(images): download e conversão para JPEG`.

### Task 3: Imagens em artigos

**Files:** Create `src/extract/lazy-images.ts`, `src/images/embed.ts`; Modify `entrypoints/extract.ts`, `src/range/fetch-chapter.ts`, `src/extract/to-chapter.ts`, `src/core/types.ts`, `src/panel/pipeline.ts`, `entrypoints/sidepanel/Home.tsx` (prévia); Tests `tests/extract/lazy-images.test.ts`, `tests/extract/to-chapter.test.ts`, `tests/images/embed.test.ts`.

**Interfaces:**
```ts
export function resolveLazyImages(doc: Document, baseUrl: string): void; // src ← data-src | data-lazy-src | data-original | maior srcset; absoluto; remove srcset/sizes
// Chapter ganha: imageUrls?: string[]   (índice N ↔ marcador `kf-img:N`)
export async function embedImages(chapters: Chapter[], d: { fetchFn: typeof fetch; signal?: AbortSignal; onProgress?: (done: number, total: number) => void }):
  Promise<{ chapters: Chapter[]; images: EpubImage[]; failed: number }>;
```
- `resolveLazyImages` roda antes do Readability em `extract.js` (no clone) e em `fetchChapter` (após inserir `<base>`).
- `htmlToChapter`: deixa de remover `img`; desembrulha `picture`, remove `source`; mantém em `img` só `src` (http/https) e `alt`; `img` sem src válido some; troca `src` por `kf-img:N` (URLs repetidas reusam N) e devolve `imageUrls`.
- `embedImages`: baixa com concorrência `IMAGE_CONCURRENCY`, converte, nomeia `images/i{N}-{k}.jpg`; substitui no XHTML cada `<img src="kf-img:N" …/>` por uma ou mais `<img src="../images/…" alt="…"/>` (fatias) ou remove se falhou.
- `pipeline.itemsToEpubs` chama `embedImages` e passa `images` ao `Book`; devolve também `failedImages`. Painel mostra "Baixando imagens X de Y…" e, ao fim, aviso se `failed > 0`.
- Prévia: troca `kf-img:N` pela URL original só para exibir.

- [ ] Testes: lazy (cada atributo, srcset maior, relativo → absoluto); to-chapter (mantém img, marcador, alt, dedupe, picture/source, `data:` e `javascript:` descartados); embed com `toKindleJpegs` e fetch falsos (substituição, fatias múltiplas, falha removida, contagem).
- [ ] RED → implementar → GREEN → commit `feat(images): imagens de artigos no EPUB`.

### Task 4: Detecção e extração de quadrinhos

**Files:** Create `src/extract/comic.ts`; Modify `src/extract/readability.ts` (`extractFromDocument`), `src/core/types.ts`, `src/queue/store.ts` (validação aceita `images`); Test `tests/extract/comic.test.ts` (+ fixtures HTML sintéticas).

**Interfaces:**
```ts
// ExtractedItem.kind ganha 'comic'; ExtractedItem ganha images?: string[]
export function extractComicImages(doc: Document): string[] | null;
```
Heurística (após `resolveLazyImages`): candidatos = `img` com src http(s) fora de `header, nav, footer, aside` e sem `logo|avatar|icon|cover|banner` em alt/class/src. Se há imgs com `data-page`, `data-page-index` ou alt `/page\s*\d+/i`, usar só essas. Agrupar pelo ancestral comum mais profundo que contém a maioria; ≥ 3 imagens e texto do grupo < 200 palavras → lista em ordem do documento, sem repetição. Senão `null`.
`extractFromDocument`: tenta quadrinho primeiro; se achou → `{ kind: 'comic', images, html: '' , title, author, … }`; senão artigo como hoje.

- [ ] Testes: fixture estilo leitor (logo + capa + 12 páginas `data-page-index`) → só as 12 em ordem; fixture sem marcação de página com 6 imgs grandes num container → 6; artigo com 2 imagens → `null`; página de texto → `null`; lazy `data-src` resolvido.
- [ ] RED → implementar → GREEN → commit `feat(extract): detecção de quadrinhos`.

### Task 5: EPUB de quadrinho, juntar e intervalo

**Files:** Modify `src/panel/pipeline.ts`, `src/queue/merge.ts` (parts carregam `images?`), `src/epub/templates.ts` (CSS de página de imagem), `entrypoints/sidepanel/Home.tsx`/`QueueList.tsx` (prévia de quadrinho: miniaturas das 3 primeiras + "N páginas"); Tests `tests/panel/pipeline.test.ts`, `tests/queue/merge.test.ts`.

- Item `comic` → 1 capítulo: `<h1>` com o título + cada imagem (e cada fatia) como `<div class="kf-page"><img src="../images/…" alt=""/></div>`; CSS `.kf-page { page-break-before: always; text-align: center; margin: 0 } .kf-page img { max-width: 100%; height: auto }`. EPUB reflowable (não fixed-layout).
- Reusar `embedImages` (o capítulo de quadrinho é montado com marcadores `kf-img:N`, um por imagem).
- Juntar quadrinhos → um capítulo por parte; juntar artigo + quadrinho é permitido.
- Intervalo de capítulos: nada a mudar além de `fetchChapter` já devolver `kind: 'comic'` (Task 4); confirmar com teste.
- Arquivo > limite do Gmail continua indo para `tooLarge` (download oferecido) — sem mudança.

- [ ] Testes: comic com 3 imagens (uma gera 2 fatias) → capítulo com 4 `kf-page`, 4 imagens JPEG no zip, epubcheck (skipIf sem java); merge com parts comic; `fetchChapter` em fixture de quadrinho → `kind: 'comic'`.
- [ ] RED → implementar → GREEN → commit `feat(comic): EPUB de quadrinhos`.

### Task 6: Teste ponta a ponta no Chromium

**Files:** Create `playwright.config.ts`, `tests/e2e/images.spec.ts`, `tests/e2e/server.ts`, `scripts/gen-fixture-images.mjs`, `tests/fixtures/images/*` (gerados pelo script, versionados); Modify `package.json` (`test:e2e`, devDep `@playwright/test`), `vitest.config.ts` (excluir `tests/e2e`).

- `gen-fixture-images.mjs` usa o Chromium do Playwright para gerar com canvas: `strip.webp` 900×16000 com faixas brancas em y=1100 e y=2250, `small.png` 400×300 com transparência, `photo.jpg` 2400×1600.
- Servidor local: `/article` (texto + `small.png` + `photo.jpg` lazy `data-src` + um `<img>` 404), `/comic/chapter/1..3` (logo + 3 páginas, uma delas `strip.webp`).
- Teste: carrega `output/chrome-mv3` (`--load-extension`, `channel: 'chromium'`), abre o painel como página `chrome-extension://…/sidepanel.html` (traz a aba do conteúdo para frente antes de clicar, como nos testes manuais), adiciona `/article` e o intervalo `/comic/chapter/1..3`, baixa selecionados e junta os 3 capítulos; abre os EPUBs com JSZip e verifica: só `image/jpeg` no OPF; artigo com 2 imagens (a 404 removida, aviso "1 imagem falhou"); fatias da tira ≥ 13 e todas com altura ≤ 1.25 × 900 × PAGE_ASPECT; JPEG do PNG transparente com pixel do canto claro (não preto); epubcheck sem erros (skipIf sem java).
- [ ] Escrever o teste → rodar `pnpm wxt build && pnpm test:e2e` → passar → commit `test(e2e): imagens e quadrinhos no Chromium`.
- [ ] **Checkpoint do dono:** intervalo `limitless-predation…/chapter/10..12` no Asura Scans, baixar, abrir no Kindle (ou no app Kindle) e conferir legibilidade das tiras.
