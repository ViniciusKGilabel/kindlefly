import { Readability } from '@mozilla/readability';
import { KfError } from '../core/errors';
import { extractComicImages } from './comic';
import { cleanTitle } from './clean-title';
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
  const host = hostnameOf(url);
  const images = extractComicImages(doc);
  if (images) {
    return {
      sourceUrl: url,
      title: cleanTitle(doc.title?.trim() ?? '') || host,
      author:
        doc.querySelector('meta[name="author"]')?.getAttribute('content')?.trim() ||
        doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content')?.trim() ||
        host,
      language,
      html: '',
      kind: 'comic',
      images,
    };
  }
  const article = new Readability(doc).parse();
  if (!article || !article.content) throw new KfError('extract_failed');
  return {
    sourceUrl: url,
    title: cleanTitle(article.title?.trim() ?? '') || host,
    author: article.byline?.trim() || article.siteName?.trim() || host,
    language,
    html: article.content,
    kind: 'article',
  };
}
