import { KfError } from '../core/errors';
import { IMAGE_MAX_BYTES } from './layout';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;
const SVG_EXT = /\.svg$/i;

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split(/[?#]/)[0] ?? '';
  }
}

async function reject(res: Response, reason: string): Promise<never> {
  try {
    await res.body?.cancel();
  } catch {
    /* ignora */
  }
  throw new KfError('image_failed', reason);
}

/** Baixa uma imagem sem credenciais; rejeita com image_failed se não for uma imagem válida. AbortError propaga. */
export async function fetchImageBlob(url: string, fetchFn: typeof fetch, signal?: AbortSignal): Promise<Blob> {
  const res = await fetchFn(url, { signal, credentials: 'omit' });
  if (!res.ok) return reject(res, `HTTP ${res.status}`);
  const type = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  const path = pathOf(url);
  if (type === 'image/svg+xml' || SVG_EXT.test(path)) return reject(res, 'svg');
  // Tipo ausente/genérico só vale com extensão de imagem conhecida.
  const generic = type === '' || type === 'application/octet-stream' || type === 'binary/octet-stream';
  if (generic ? !IMAGE_EXT.test(path) : !type.startsWith('image/')) {
    return reject(res, `content-type ${type || 'ausente'}`);
  }
  const lenHeader = res.headers.get('content-length');
  const len = lenHeader === null ? NaN : Number(lenHeader);
  if (Number.isFinite(len) && len > IMAGE_MAX_BYTES) return reject(res, 'muito grande');
  const blob = await res.blob();
  if (blob.size > IMAGE_MAX_BYTES) throw new KfError('image_failed', 'muito grande');
  return blob;
}
