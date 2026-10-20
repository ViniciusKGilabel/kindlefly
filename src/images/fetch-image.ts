import { KfError } from '../core/errors';
import { IMAGE_MAX_BYTES } from './layout';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i;

function hasImageExtension(url: string): boolean {
  try {
    return IMAGE_EXT.test(new URL(url).pathname);
  } catch {
    return IMAGE_EXT.test(url.split(/[?#]/)[0] ?? '');
  }
}

/** Baixa uma imagem sem credenciais; rejeita com image_failed se não for uma imagem válida. AbortError propaga. */
export async function fetchImageBlob(url: string, fetchFn: typeof fetch, signal?: AbortSignal): Promise<Blob> {
  const res = await fetchFn(url, { signal, credentials: 'omit' });
  if (!res.ok) throw new KfError('image_failed', `HTTP ${res.status}`);
  const type = (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (type ? !type.startsWith('image/') : !hasImageExtension(url)) {
    throw new KfError('image_failed', `content-type ${type || 'ausente'}`);
  }
  const len = Number(res.headers.get('content-length'));
  if (Number.isFinite(len) && len > IMAGE_MAX_BYTES) throw new KfError('image_failed', 'muito grande');
  const blob = await res.blob();
  if (blob.size > IMAGE_MAX_BYTES) throw new KfError('image_failed', 'muito grande');
  return blob;
}
