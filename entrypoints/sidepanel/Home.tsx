import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { createGoogleAuth } from '../../src/auth/google';
import { t } from '../../src/core/i18n';
import type { EpubFile, ExtractedItem } from '../../src/core/types';
import { KfError } from '../../src/core/errors';
import { errorMessage, extractActiveTab } from '../../src/panel/extract-active';
import { itemToEpub } from '../../src/panel/pipeline';
import { htmlToChapter } from '../../src/extract/to-chapter';
import { sendToKindle } from '../../src/send/gmail';
import { getKindleAddress } from '../../src/settings/store';

type Item = Omit<ExtractedItem, 'id'>;
type Status =
  | { s: 'extracting' }
  | { s: 'ready' }
  | { s: 'sending' }
  | { s: 'sent'; to: string }
  | { s: 'error'; text: string; canRetry?: boolean };

function download(file: EpubFile) {
  const blob = new Blob([file.data as BlobPart], { type: 'application/epub+zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function unexpected(e: unknown): string {
  console.warn('[kindlefly]', 'unexpected', e instanceof Error ? e.message : String(e));
  return t('error_unexpected');
}

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

export default function Home() {
  const auth = useMemo(() => createGoogleAuth(), []);
  const [item, setItem] = useState<Item | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [status, setStatus] = useState<Status>({ s: 'extracting' });

  async function extract() {
    setStatus({ s: 'extracting' });
    try {
      const r = await extractActiveTab();
      setItem(r);
      setTitle(r.title);
      setAuthor(r.author);
      setStatus({ s: 'ready' });
    } catch (e) {
      setItem(null);
      setStatus({ s: 'error', text: errorMessage(e, t), canRetry: true });
    }
  }

  useEffect(() => {
    void extract();
  }, []);

  // Já sanitizado por htmlToChapter (sem scripts, handlers nem iframes): só então vai para o DOM.
  const previewHtml = useMemo(
    () => (item ? htmlToChapter(item.html, { id: 'c1', title }).xhtmlBody : ''),
    [item, title],
  );

  const full = item ? { ...item, id: 'current' } : null;
  const busy = status.s === 'extracting' || status.s === 'sending';

  async function onDownload() {
    if (!full) return;
    try {
      download(await itemToEpub(full, { title, author }));
    } catch (e) {
      setStatus({ s: 'error', text: e instanceof KfError ? errorMessage(e, t) : unexpected(e) });
    }
  }

  async function onSend() {
    if (!full) return;
    setStatus({ s: 'sending' });
    try {
      const file = await itemToEpub(full, { title, author });
      const kindleAddress = await getKindleAddress();
      const r = await sendToKindle([file], {
        auth,
        kindleAddress,
        fetchFn: (...a) => fetch(...a),
        subject: title,
      });
      if (r.tooLarge.length > 0) setStatus({ s: 'error', text: t('error_too_large') });
      else setStatus({ s: 'sent', to: kindleAddress ?? '' });
    } catch (e) {
      setStatus({ s: 'error', text: errorMessage(e, t) });
    }
  }

  return (
    <section className="screen">
      {status.s === 'extracting' && <p role="status">{t('extracting')}</p>}
      {status.s === 'sending' && <p role="status">{t('sending')}</p>}
      {status.s === 'sent' && (
        <p className="ok" role="status">
          {t('sentTo', [status.to])}
        </p>
      )}
      {status.s === 'error' && (
        <p className="error" role="alert">
          {status.text}
          {status.canRetry && (
            <>
              {' '}
              <button type="button" onClick={extract}>
                {t('retryExtract')}
              </button>
            </>
          )}
        </p>
      )}

      {item && (
        <>
          <label htmlFor="title">{t('titleLabel')}</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label htmlFor="author">{t('authorLabel')}</label>
          <input id="author" value={author} onChange={(e) => setAuthor(e.target.value)} />
          <div className="row">
            <button type="button" onClick={onDownload} disabled={busy}>
              {t('downloadEpub')}
            </button>
            <button type="button" className="primary" onClick={onSend} disabled={busy}>
              {t('sendToKindle')}
            </button>
          </div>
          <button type="button" onClick={extract} disabled={busy}>
            {t('extractThisTab')}
          </button>
          <h2>{t('previewLabel')}</h2>
          <article className="preview" onClick={onPreviewClick} dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </>
      )}
    </section>
  );
}
