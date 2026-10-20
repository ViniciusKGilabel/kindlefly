import type { EpubFile } from '../core/types';
import { createImageCache } from '../images/embed';
import { JPEG_QUALITY_STEPS } from '../images/layout';
import { mergeTitle } from '../queue/merge';
import type { QueueItem } from '../queue/queue';
import { estimateMimeBytes, GMAIL_MAX_MESSAGE_BYTES } from '../send/batch';
import {
  buildItem, chapterName, isItemFailure, itemLabel, resolveGrayscale, uniqueNamer,
  type BuiltItem, type ImageOptions,
} from './pipeline';

/** O EPUB (bytes crus) cabe num e-mail do Gmail, já em base64 com cabeçalhos. */
export function fitsInEmail(rawBytes: number): boolean {
  return estimateMimeBytes(rawBytes) <= GMAIL_MAX_MESSAGE_BYTES;
}

export interface SendPlan {
  /** Cabem no e-mail, na ordem dos itens (e dos volumes). */
  files: EpubFile[];
  /** Não cabem nem na menor qualidade: ficam em memória para "Baixar". */
  tooLarge: EpubFile[];
  failedImages: number;
  /** Itens que não puderam ser gerados (ex.: quadrinho sem nenhuma página). */
  failedItems: string[];
}

export interface PlanOptions extends ImageOptions {
  /** Só para testes: troca o limite do Gmail. */
  fits?: (rawBytes: number) => boolean;
}

type Part = NonNullable<QueueItem['parts']>[number];
type Build = (item: QueueItem, title: string, quality: number) => Promise<BuiltItem>;

interface Outcome {
  fits: BuiltItem[];
  tooLarge: BuiltItem[];
  /** Imagens de partes que ficaram de fora por não terem nenhuma página. */
  droppedImages?: number;
}

/**
 * Um EPUB que não cabe: reconverte as imagens nos degraus menores de qualidade.
 * Se nenhum couber, devolve o da qualidade original (o melhor para baixar).
 */
async function degrade(first: BuiltItem, rebuild: (q: number) => Promise<BuiltItem>, fits: (n: number) => boolean): Promise<Outcome> {
  if (first.imageCount > 0) {
    for (const q of JPEG_QUALITY_STEPS.slice(1)) {
      const b = await rebuild(q);
      if (fits(b.file.data.length)) return { fits: [b], tooLarge: [] };
    }
  }
  return { fits: [], tooLarge: [first] };
}

/** Título do volume: segue o padrão do merge, ou "<título editado> (vol. N)". */
function volumeTitler(item: QueueItem): (vol: Part[], n: number) => string {
  const edited = item.title.trim();
  // Mesmo cálculo de mergeItems (títulos originais): se bate, o usuário não editou.
  const followsPattern = !edited || edited === mergeTitle(item.parts!.map((p) => p.title)).trim();
  return (vol, n) => {
    if (!followsPattern) return `${edited} (vol. ${n})`;
    return vol.length === 1 ? vol[0]!.title : mergeTitle(vol.map((p) => p.title));
  };
}

/**
 * Item juntado que não cabe: divide as partes em volumes, na ordem, gulosamente.
 * O tamanho de cada parte sozinha (imagens em cache) estima o volume; o volume é
 * construído e medido, e reconstruído com uma parte a menos se passar do limite.
 */
async function splitVolumes(item: QueueItem, build: Build, fits: (n: number) => boolean): Promise<Outcome> {
  // Títulos vazios resolvidos pela posição original ("Chapter N"), antes de dividir.
  const all = item.parts!.map((p, i) => ({ ...p, title: p.title.trim() || chapterName(i + 1) }));
  const sub = (vol: Part[]): QueueItem => ({ ...item, parts: vol });
  const titleOf = volumeTitler(item);

  const parts: Part[] = [];
  const sizes: number[] = [];
  let dropped = 0;
  for (const p of all) {
    try {
      sizes.push((await build(sub([p]), p.title, JPEG_QUALITY_STEPS[0])).file.data.length);
      parts.push(p);
    } catch (e) {
      if (!isItemFailure(e)) throw e; // parte sem nenhuma página: fica de fora
      dropped += new Set(p.images ?? []).size;
    }
  }

  const out: Outcome = { fits: [], tooLarge: [], droppedImages: dropped };
  let i = 0;
  let n = 0;
  while (i < parts.length) {
    n++;
    let j = i;
    let sum = sizes[i]!;
    while (j + 1 < parts.length && fits(sum + sizes[j + 1]!)) sum += sizes[++j]!;
    for (;;) {
      const vol = parts.slice(i, j + 1);
      const title = titleOf(vol, n);
      const b = await build(sub(vol), title, JPEG_QUALITY_STEPS[0]);
      if (fits(b.file.data.length)) {
        out.fits.push(b);
        break;
      }
      if (j > i) {
        j--;
        continue;
      }
      const r = await degrade(b, (q) => build(sub(vol), title, q), fits);
      out.fits.push(...r.fits);
      out.tooLarge.push(...r.tooLarge);
      break;
    }
    i = j + 1;
  }
  return out;
}

/**
 * Arquivos para ENVIAR: como o download (um EPUB por item), mas cada arquivo
 * precisa caber num e-mail. Juntado grande demais vira volumes; arquivo único
 * grande demais tenta qualidades menores; o que não couber vai em tooLarge.
 */
export async function planSendFiles(items: QueueItem[], opts: PlanOptions = {}): Promise<SendPlan> {
  const fits = opts.fits ?? fitsInEmail;
  const img: ImageOptions = { ...opts, grayscale: await resolveGrayscale(opts), cache: opts.cache ?? createImageCache() };
  const build: Build = (item, title, quality) => buildItem(item, { title, author: item.author }, { ...img, quality });
  const name = uniqueNamer();
  const plan: SendPlan = { files: [], tooLarge: [], failedImages: 0, failedItems: [] };

  for (const item of items) {
    let r: Outcome;
    try {
      const whole = await build(item, item.title, JPEG_QUALITY_STEPS[0]);
      if (fits(whole.file.data.length)) r = { fits: [whole], tooLarge: [] };
      else if (item.kind === 'merged' && (item.parts?.length ?? 0) > 1) {
        whole.file.data = new Uint8Array(0); // libera o livro inteiro (pode ter dezenas de MB) antes dos volumes
        r = await splitVolumes(item, build, fits);
      } else r = await degrade(whole, (q) => build(item, item.title, q), fits);
    } catch (e) {
      if (!isItemFailure(e)) throw e;
      plan.failedItems.push(itemLabel(item));
      continue;
    }
    for (const b of r.fits) plan.files.push(name(b.file));
    for (const b of r.tooLarge) plan.tooLarge.push(name(b.file));
    plan.failedImages += [...r.fits, ...r.tooLarge].reduce((a, b) => a + b.failed, r.droppedImages ?? 0);
  }
  return plan;
}
