import { useMemo, type MouseEvent } from 'react';
import { t } from '../../src/core/i18n';
import type { ExtractedItem } from '../../src/core/types';
import { htmlToChapter, previewBody } from '../../src/extract/to-chapter';

type PreviewItem = Pick<ExtractedItem, 'kind' | 'title' | 'html' | 'images'> & {
  parts?: { title: string; images?: string[] }[];
};

function onPreviewClick(e: MouseEvent<HTMLElement>) {
  const a = (e.target as HTMLElement).closest('a');
  if (!a) return;
  e.preventDefault();
  const href = a.getAttribute('href') ?? '';
  try {
    const u = new URL(href, 'https://invalid.invalid/');
    if (href && (u.protocol === 'http:' || u.protocol === 'https:') && u.host !== 'invalid.invalid') {
      void browser.tabs.create({ url: u.href });
    }
  } catch {
    // href inválido: ignora.
  }
}

export default function Preview({ item, testId }: { item: PreviewItem; testId?: string }) {
  // Já sanitizado por htmlToChapter (sem scripts, handlers nem iframes): só então vai para o DOM.
  const html = useMemo(
    () => (item.kind !== 'merged' && item.kind !== 'comic' ? previewBody(htmlToChapter(item.html, { id: 'c1', title: item.title })) : ''),
    [item.html, item.title, item.kind],
  );
  if (item.kind === 'merged') {
    return (
      <ol className="preview" data-testid={testId}>
        {(item.parts ?? []).map((p, i) => (
          <li key={i}>{p.images ? `${p.title} (${t('comicPages', [String(p.images.length)])})` : p.title}</li>
        ))}
      </ol>
    );
  }
  if (item.kind === 'comic') {
    return (
      <div className="preview" data-testid={testId}>
        <div className="thumbs">
          {(item.images ?? [])
            .filter((u) => /^https?:\/\//i.test(u))
            .slice(0, 3)
            .map((u, i) => (
              <img key={i} src={u} alt="" loading="lazy" referrerPolicy="no-referrer" />
            ))}
        </div>
        <p>{t('comicPages', [String(item.images?.length ?? 0)])}</p>
      </div>
    );
  }
  return <article className="preview" data-testid={testId} onClick={onPreviewClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
