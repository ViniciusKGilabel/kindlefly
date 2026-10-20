// @vitest-environment jsdom
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';
import type { EpubFile } from '../../src/core/types';
import { fitsInEmail, planSendFiles } from '../../src/panel/send-plan';
import { mergeTitle } from '../../src/queue/merge';
import type { QueueItem } from '../../src/queue/queue';

// JPEG 1x1 válido; o resto da fatia é preenchimento depois do EOI (ignorado pelos leitores).
const JPEG = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQAASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64'));
const hasJava = spawnSync('java', ['-version']).status === 0;
const KB = 1000;
/** Limite de teste: EPUB "cabe" se tiver até 250 KB. */
const fits = (b: number) => b <= 250 * KB;

/** Conversor falso: a URL diz o tamanho em 0.8 (`?kb=N`) e a fatia encolhe proporcionalmente à qualidade. */
function fakeImages() {
  const calls = { fetch: [] as string[], convert: [] as Array<[string, number | undefined]> };
  return {
    calls,
    embed: {
      fetchImage: async (u: string) => {
        calls.fetch.push(u);
        if (u.includes('bad')) throw new Error('offline');
        return new Blob([u]);
      },
      convert: async (b: Blob, o: { grayscale: boolean; quality?: number }) => {
        const u = await b.text();
        calls.convert.push([u, o.quality]);
        const kb = Number(/kb=(\d+)/.exec(u)?.[1] ?? 1);
        const data = new Uint8Array(Math.round((kb * KB * (o.quality ?? 0.8)) / 0.8));
        data.set(JPEG);
        return [{ data, width: 1, height: 1 }];
      },
    },
  };
}

const part = (n: number, kb: number, extra = '') => ({
  title: `Limitless Predation Chapter ${n}`, html: '', sourceUrl: `https://x.test/ch/${n}`,
  images: [`https://x.test/${n}/a.jpg?kb=${kb / 2}${extra}`, `https://x.test/${n}/b.jpg?kb=${kb / 2}`],
});
const merged = (parts: NonNullable<QueueItem['parts']>, title = mergeTitle(parts.map((p) => p.title))): QueueItem => ({
  id: 'm', sourceUrl: 'merged:m', title, author: 'Autor', language: 'en', html: '', kind: 'merged',
  parts, selected: true, addedAt: 1,
});
const comic = (title: string, kb: number): QueueItem => ({
  id: title, sourceUrl: `https://x.test/${title}`, title, author: 'A', language: 'en', html: '', kind: 'comic',
  images: [`https://x.test/${title}/p.jpg?kb=${kb}`], selected: true, addedAt: 1,
});
async function navOf(f: EpubFile): Promise<string> {
  return (await JSZip.loadAsync(f.data)).file('OEBPS/nav.xhtml')!.async('string');
}
async function titleOf(f: EpubFile): Promise<string> {
  const opf = await (await JSZip.loadAsync(f.data)).file('OEBPS/content.opf')!.async('string');
  return /<dc:title>([^<]*)<\/dc:title>/.exec(opf)![1]!;
}

test('fitsInEmail usa a estimativa MIME contra o limite do Gmail', () => {
  expect(fitsInEmail(18 * 1024 * 1024)).toBe(true);
  expect(fitsInEmail(19 * 1024 * 1024)).toBe(false);
});

describe('volumes automáticos ao enviar item juntado (A)', () => {
  test('cabe inteiro: um arquivo, título original, nenhuma reconversão', async () => {
    const im = fakeImages();
    const item = merged([part(10, 100), part(11, 100)]);
    const r = await planSendFiles([item], { grayscale: true, embed: im.embed, fits });
    expect(r.files.map((f) => f.filename)).toEqual(['Limitless Predation Chapter 10–11.epub']);
    expect(r.tooLarge).toEqual([]);
    expect(im.calls.convert).toHaveLength(4);
  });

  test('não cabe: divide na ordem, cada volume o maior possível, títulos por mergeTitle', async () => {
    const im = fakeImages();
    const item = merged([part(10, 100), part(11, 100), part(12, 100), part(13, 100), part(14, 100)]);
    const r = await planSendFiles([item], { grayscale: true, embed: im.embed, fits });
    expect(r.files.map((f) => f.filename)).toEqual([
      'Limitless Predation Chapter 10–11.epub',
      'Limitless Predation Chapter 12–13.epub',
      'Limitless Predation Chapter 14.epub',
    ]);
    expect(await titleOf(r.files[0]!)).toBe('Limitless Predation Chapter 10–11');
    for (const f of r.files) expect(f.data.length).toBeLessThanOrEqual(250 * KB);
    const nav = await navOf(r.files[1]!);
    expect(nav.indexOf('Chapter 12')).toBeGreaterThan(-1);
    expect(nav.indexOf('Chapter 13')).toBeGreaterThan(nav.indexOf('Chapter 12'));
    expect(nav).not.toContain('Chapter 11');
    expect(r.tooLarge).toEqual([]);
    // reaproveita: cada imagem baixada e convertida uma única vez
    expect(im.calls.fetch).toHaveLength(10);
    expect(im.calls.convert).toHaveLength(10);
    if (hasJava) {
      const p = join(mkdtempSync(join(tmpdir(), 'kf-')), 'v.epub');
      writeFileSync(p, r.files[0]!.data);
      const out = spawnSync('node', ['scripts/epubcheck.mjs', p], { encoding: 'utf8' });
      expect(out.stdout + out.stderr).toContain('No errors or warnings detected');
    }
  }, 120_000);

  test('partes de tamanhos diferentes: guloso na ordem', async () => {
    const im = fakeImages();
    const item = merged([part(1, 60), part(2, 60), part(3, 60), part(4, 200), part(5, 30)]);
    const r = await planSendFiles([item], { grayscale: true, embed: im.embed, fits });
    expect(r.files.map((f) => f.filename)).toEqual([
      'Limitless Predation Chapter 1–3.epub',
      'Limitless Predation Chapter 4–5.epub',
    ]);
  });

  test('título editado fora do padrão → "<título> (vol. N)"', async () => {
    const im = fakeImages();
    const item = merged([part(10, 100), part(11, 100), part(12, 100)], 'Minha coleção');
    const r = await planSendFiles([item], { grayscale: true, embed: im.embed, fits });
    expect(r.files.map((f) => f.filename)).toEqual(['Minha coleção (vol. 1).epub', 'Minha coleção (vol. 2).epub']);
    expect(await titleOf(r.files[1]!)).toBe('Minha coleção (vol. 2)');
  });

  test('parte sozinha grande demais: só ela cai de qualidade; ordem mantida', async () => {
    const im = fakeImages();
    const item = merged([part(1, 100), part(2, 360), part(3, 100)]);
    const r = await planSendFiles([item], { grayscale: true, embed: im.embed, fits });
    expect(r.files.map((f) => f.filename)).toEqual([
      'Limitless Predation Chapter 1.epub',
      'Limitless Predation Chapter 2.epub',
      'Limitless Predation Chapter 3.epub',
    ]);
    const q = (frag: string) => im.calls.convert.filter(([u]) => u.includes(frag)).map(([, x]) => x);
    expect(q('/2/a.jpg')).toEqual([0.8, 0.65, 0.5]);
    expect(q('/1/a.jpg')).toEqual([0.8]);
    expect(r.files[1]!.data.length).toBeLessThanOrEqual(250 * KB);
  });

  test('capítulo de quadrinho sem páginas fica fora dos volumes', async () => {
    const im = fakeImages();
    const bad = { ...part(2, 100), images: ['https://x.test/bad1.jpg', 'https://x.test/bad2.jpg'] };
    const item = merged([part(1, 200), bad, part(3, 200)]);
    const r = await planSendFiles([item], { grayscale: true, embed: im.embed, fits });
    expect(r.files.map((f) => f.filename)).toEqual([
      'Limitless Predation Chapter 1.epub',
      'Limitless Predation Chapter 3.epub',
    ]);
    expect(r.failedItems).toEqual([]);
    expect(r.failedImages).toBe(2);
  });
});

describe('qualidade adaptativa (B)', () => {
  test('item simples: cai para 0.65 quando 0.8 não cabe', async () => {
    const im = fakeImages();
    const r = await planSendFiles([comic('Grande', 280)], { grayscale: true, embed: im.embed, fits });
    expect(r.files.map((f) => f.filename)).toEqual(['Grande.epub']);
    expect(im.calls.convert.map(([, q]) => q)).toEqual([0.8, 0.65]);
    expect(im.calls.fetch).toHaveLength(1);
    expect(r.tooLarge).toEqual([]);
  });

  test('nem em 0.5 cabe → tooLarge com o arquivo da qualidade original', async () => {
    const im = fakeImages();
    const r = await planSendFiles([comic('Enorme', 600), comic('Pequeno', 50)], { grayscale: true, embed: im.embed, fits });
    expect(r.files.map((f) => f.filename)).toEqual(['Pequeno.epub']);
    expect(r.tooLarge.map((f) => f.filename)).toEqual(['Enorme.epub']);
    expect(r.tooLarge[0]!.data.length).toBeGreaterThan(600 * KB);
    expect(im.calls.convert.filter(([u]) => u.includes('Enorme')).map(([, q]) => q)).toEqual([0.8, 0.65, 0.5]);
  });

  test('sem imagens e grande demais: vai direto para tooLarge, sem reconstruir', async () => {
    const im = fakeImages();
    const article: QueueItem = {
      id: 'a', sourceUrl: 'https://x.test/a', title: 'Artigo', author: 'A', language: 'en',
      html: '<p>texto</p>', kind: 'article', selected: true, addedAt: 1,
    };
    const r = await planSendFiles([article], { grayscale: true, embed: im.embed, fits: () => false });
    expect(r.tooLarge.map((f) => f.filename)).toEqual(['Artigo.epub']);
    expect(r.files).toEqual([]);
    expect(im.calls.convert).toEqual([]);
  });

  test('item sem páginas é informado; os outros seguem', async () => {
    const im = fakeImages();
    const dead: QueueItem = { ...comic('Morto', 10), images: ['https://x.test/bad.jpg'] };
    const r = await planSendFiles([dead, comic('Vivo', 10)], { grayscale: true, embed: im.embed, fits });
    expect(r.failedItems).toEqual(['Morto']);
    expect(r.files.map((f) => f.filename)).toEqual(['Vivo.epub']);
  });

  test('nomes repetidos ganham sufixo como no download', async () => {
    const im = fakeImages();
    const r = await planSendFiles([comic('X', 10), { ...comic('X', 10), id: 'y', sourceUrl: 'https://x.test/y' }], {
      grayscale: true, embed: im.embed, fits,
    });
    expect(r.files.map((f) => f.filename)).toEqual(['X.epub', 'X (2).epub']);
  });
});
