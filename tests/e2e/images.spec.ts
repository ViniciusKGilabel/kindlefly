import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import JSZip from 'jszip';
import { PAGE_ASPECT } from '../../src/images/layout';
import { startServer, type Fixtures } from './server';

const EXT_DIR = resolve('output/chrome-mv3');
const EXT_ID = 'mldnanjggjdhajchcgldihldickkjfee';
const hasJava = spawnSync('java', ['-version']).status === 0;

let fixtures: Fixtures;
let server: Awaited<ReturnType<typeof startServer>>;
let tmp: string;

/** Gera as imagens de teste num canvas do próprio Chromium (sem binários no repo). */
async function makeFixtures(): Promise<Fixtures> {
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  try {
    const page = await browser.newPage();
    const b64 = await page.evaluate(async () => {
      const enc = async (c: OffscreenCanvas, type: string, q?: number) => {
        const blob = await c.convertToBlob({ type, quality: q });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let s = '';
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return btoa(s);
      };
      const canvas = (w: number, h: number) => {
        const c = new OffscreenCanvas(w, h);
        return { c, x: c.getContext('2d')! };
      };
      // tira 900×16000 com faixas brancas em y=1100 e y=2250
      const strip = canvas(900, 16000);
      for (let y = 0; y < 16000; y += 100) {
        strip.x.fillStyle = `hsl(${(y / 100) * 37 % 360} 60% 35%)`;
        strip.x.fillRect(0, y, 900, 100);
        strip.x.fillStyle = '#fff';
        strip.x.fillRect(100 + (y % 300), y + 20, 80, 40);
      }
      strip.x.fillStyle = '#fff';
      for (const y of [1100, 2250]) strip.x.fillRect(0, y - 20, 900, 40);
      // PNG transparente 400×300: só o miolo é opaco (escuro)
      const small = canvas(400, 300);
      small.x.fillStyle = '#202040';
      small.x.fillRect(100, 75, 200, 150);
      const photo = canvas(2400, 1600);
      const g = photo.x.createLinearGradient(0, 0, 2400, 1600);
      g.addColorStop(0, '#c33');
      g.addColorStop(1, '#36c');
      photo.x.fillStyle = g;
      photo.x.fillRect(0, 0, 2400, 1600);
      const pg = canvas(900, 1200);
      pg.x.fillStyle = '#486';
      pg.x.fillRect(0, 0, 900, 1200);
      pg.x.fillStyle = '#fff';
      pg.x.fillRect(200, 300, 500, 600);
      const logo = canvas(200, 60);
      logo.x.fillStyle = '#00f';
      logo.x.fillRect(0, 0, 200, 60);
      return {
        strip: await enc(strip.c, 'image/webp', 0.9),
        small: await enc(small.c, 'image/png'),
        photo: await enc(photo.c, 'image/jpeg', 0.9),
        page: await enc(pg.c, 'image/png'),
        logo: await enc(logo.c, 'image/png'),
      };
    });
    const buf = (s: string) => Buffer.from(s, 'base64');
    return {
      stripWebp: buf(b64.strip),
      smallPng: buf(b64.small),
      photoJpg: buf(b64.photo),
      pagePng: buf(b64.page),
      logoPng: buf(b64.logo),
    };
  } finally {
    await browser.close();
  }
}

async function launch(): Promise<BrowserContext> {
  return chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    acceptDownloads: true,
    locale: 'pt-BR',
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
  });
}

/** Abre a página de conteúdo e o painel (como aba); deixa o conteúdo ativo. */
async function openPanel(ctx: BrowserContext, url: string): Promise<{ content: Page; panel: Page }> {
  const content = await ctx.newPage();
  await content.goto(url);
  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${EXT_ID}/sidepanel.html`);
  await expect(panel.getByTestId('add-to-list')).toBeVisible();
  await content.bringToFront();
  await expect(panel.getByTestId('add-to-list')).toBeEnabled();
  return { content, panel };
}

async function downloadAll(panel: Page, name: string): Promise<string[]> {
  const files: string[] = [];
  const onDl = async (d: import('@playwright/test').Download) => {
    const out = join(tmp, `${name}-${files.length}-${d.suggestedFilename()}`);
    await d.saveAs(out);
    files.push(out);
  };
  panel.on('download', onDl);
  await panel.getByTestId('download').click();
  await expect.poll(() => files.length, { timeout: 60_000 }).toBeGreaterThan(0);
  await panel.waitForTimeout(500);
  panel.off('download', onDl);
  return files;
}

async function zipOf(path: string): Promise<JSZip> {
  return JSZip.loadAsync(readFileSync(path));
}

/** Dimensões e pixels (canto / centro) de JPEGs, decodificados no Chromium. */
async function inspectJpegs(blobs: Buffer[]) {
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  try {
    const page = await browser.newPage();
    return await page.evaluate(async (list) => {
      const out = [];
      for (const b64 of list) {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const bm = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
        const c = new OffscreenCanvas(bm.width, bm.height);
        const x = c.getContext('2d')!;
        x.drawImage(bm, 0, 0);
        const corner = [...x.getImageData(2, 2, 1, 1).data].slice(0, 3);
        const mid = [...x.getImageData(bm.width >> 1, bm.height >> 1, 1, 1).data].slice(0, 3);
        out.push({ w: bm.width, h: bm.height, corner, mid });
      }
      return out;
    }, blobs.map((b) => b.toString('base64')));
  } finally {
    await browser.close();
  }
}

function epubcheck(file: string) {
  const r = spawnSync('node', ['scripts/epubcheck.mjs', file], { encoding: 'utf8' });
  expect(r.status, r.stdout + r.stderr).toBe(0);
}

test.beforeAll(async () => {
  expect(existsSync(join(EXT_DIR, 'manifest.json')), 'rode `pnpm wxt build` antes').toBe(true);
  tmp = mkdtempSync(join(tmpdir(), 'kf-e2e-'));
  fixtures = await makeFixtures();
  server = await startServer(fixtures);
});

test.afterAll(async () => {
  await server?.close();
});

async function jpgsOf(z: JSZip): Promise<Buffer[]> {
  const names = Object.keys(z.files).filter((f) => /\.jpe?g$/i.test(f));
  return Promise.all(names.map(async (n) => Buffer.from(await z.file(n)!.async('uint8array'))));
}

test('artigo: imagens normal + lazy, 404 removida, só JPEG, fundo branco', async () => {
  const ctx = await launch();
  try {
    const { panel } = await openPanel(ctx, `${server.origin}/article`);
    await panel.getByTestId('add-to-list').click();
    await expect(panel.getByRole('button', { name: 'Artigo com Imagens' }).first()).toBeVisible();
    const files = await downloadAll(panel, 'article');
    expect(files).toHaveLength(1);
    await expect(panel.getByTestId('notice')).toContainText(/^1 /);

    const z = await zipOf(files[0]!);
    const names = Object.keys(z.files);
    expect(names.filter((f) => /\.(png|gif|webp|avif|svg)$/i.test(f))).toEqual([]);
    const opf = await z.file('OEBPS/content.opf')!.async('string');
    const media = [...new Set(opf.match(/media-type="image\/[a-z+]+"/g))];
    expect(media).toEqual(['media-type="image/jpeg"']);

    const chapter = await z.file(names.find((f) => /chapters\/c1\.xhtml$/.test(f))!)!.async('string');
    expect(chapter.match(/<img\b/g)).toHaveLength(2);
    expect(chapter).not.toContain('missing.png');

    const jpgs = await inspectJpegs(await jpgsOf(z));
    expect(jpgs).toHaveLength(2);
    const small = jpgs.find((j) => j.w === 400 && j.h === 300)!;
    expect(small, JSON.stringify(jpgs)).toBeTruthy();
    // canto era transparente: tem de ficar claro (não preto); miolo continua escuro
    expect(Math.min(...small.corner)).toBeGreaterThan(200);
    expect(Math.max(...small.mid)).toBeLessThan(100);
    const photo = jpgs.find((j) => j.w === 1236)!;
    expect(photo, JSON.stringify(jpgs)).toBeTruthy();

    if (hasJava) epubcheck(files[0]!);
    else test.info().annotations.push({ type: 'skip', description: 'java ausente: epubcheck pulado' });
  } finally {
    await ctx.close();
  }
});

test('quadrinho: intervalo 1..3, juntar, tira cortada em fatias, logo fora', async () => {
  const ctx = await launch();
  try {
    const { panel } = await openPanel(ctx, `${server.origin}/comic/chapter/1`);
    await panel.getByTestId('add-to-list').click();
    await expect(panel.getByTestId('range-to')).toBeVisible();
    await panel.getByTestId('range-to').fill('3');
    await panel.getByTestId('range-add').click();
    await expect(panel.getByTestId('range-summary')).toContainText(/^2 adicionados/, { timeout: 60_000 });

    await panel.getByTestId('merge').click();
    const files = await downloadAll(panel, 'comic');
    expect(files).toHaveLength(1);

    const z = await zipOf(files[0]!);
    const names = Object.keys(z.files);
    const chapters = names.filter((f) => /chapters\/c\d+\.xhtml$/.test(f));
    expect(chapters).toHaveLength(3);
    let pages = 0;
    for (const c of chapters) pages += ((await z.file(c)!.async('string')).match(/class="kf-page"/g) ?? []).length;

    const opf = await z.file('OEBPS/content.opf')!.async('string');
    expect([...new Set(opf.match(/media-type="image\/[a-z+]+"/g))]).toEqual(['media-type="image/jpeg"']);

    const jpgs = await inspectJpegs(await jpgsOf(z));
    // cada capítulo: 2 páginas normais + tira em >= 13 fatias (16000/1200); logo ausente
    expect(pages).toBeGreaterThanOrEqual(3 * (2 + 13));
    expect(jpgs.length).toBeGreaterThanOrEqual(pages);
    expect(jpgs.some((j) => j.w === 200)).toBe(false); // logo
    const maxH = 1.25 * Math.round(900 * PAGE_ASPECT);
    expect(jpgs.filter((j) => j.w === 900).length).toBeGreaterThanOrEqual(3 * (2 + 13));
    for (const j of jpgs) expect(j.h, JSON.stringify(j)).toBeLessThanOrEqual(maxH);

    if (hasJava) epubcheck(files[0]!);
  } finally {
    await ctx.close();
  }
});
