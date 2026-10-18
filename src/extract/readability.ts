import { Readability } from '@mozilla/readability';
import { KfError } from '../core/errors';
import type { ExtractedItem } from '../core/types';

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function extractFromDocument(doc: Document, url: string): Omit<ExtractedItem, 'id'> {
  const language = doc.documentElement.getAttribute('lang')?.trim() || 'en';
  const article = new Readability(doc).parse();
  if (!article || !article.content) throw new KfError('extract_failed');
  const host = hostnameOf(url);
  return {
    sourceUrl: url,
    title: article.title?.trim() || host,
    author: article.byline?.trim() || article.siteName?.trim() || host,
    language,
    html: article.content,
    kind: 'article',
  };
}
