import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createGoogleAuth } from '../../src/auth/google';
import { t } from '../../src/core/i18n';
import type { EpubFile } from '../../src/core/types';
import { KfError } from '../../src/core/errors';
import { activeTabUrl, errorMessage, extractActiveTab } from '../../src/panel/extract-active';
import { itemsToEpubs } from '../../src/panel/pipeline';
import { htmlToChapter, previewBody } from '../../src/extract/to-chapter';
import {
  addItem, removeItem, selectedItems, setAllSelected, setSelected, updateMeta, type QueueItem,
} from '../../src/queue/queue';
import { mergeItems } from '../../src/queue/merge';
import { createDebouncedSaver } from '../../src/queue/debounce';
import { loadQueue, saveQueue } from '../../src/queue/store';
import { sendToKindle } from '../../src/send/gmail';
import { getKindleAddress } from '../../src/settings/store';
import { parseChapterUrl, type ChapterUrl } from '../../src/range/chapter-url';
import ChapterRange from './ChapterRange';
import QueueList from './QueueList';

type Status =
  | { s: 'idle' }
  | { s: 'extracting' }
  | { s: 'images'; done: number; total: number }
  | { s: 'sending'; sent?: number; total?: number }
  | { s: 'sent'; count: number; to: string }
  | { s: 'info'; text: string }
  | { s: 'error'; text: string };

const DOWNLOAD_GAP_MS = 300;
const META_SAVE_MS = 400;
// A aba ativa é adicionada uma vez por vida do painel (Home remonta ao voltar das Configurações).
let autoAdded = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ s: 'idle' });
  const [notice, setNotice] = useState<string | null>(null);
  const [kindle, setKindle] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [chapter, setChapter] = useState<ChapterUrl | null>(null);
  const [ranging, setRanging] = useState(false);
  const saverRef = useRef<ReturnType<typeof createDebouncedSaver<QueueItem[]>> | null>(null);
  if (!saverRef.current) {
    saverRef.current = createDebouncedSaver<QueueItem[]>(
      (q) => saveQueue(q).catch((e) => void unexpected(e)),
      META_SAVE_MS,
    );
  }
  const saver = saverRef as { current: NonNullable<typeof saverRef.current> };


  /** Atualiza estado e ref na hora; grava já, ou com atraso (edição de título/autor). */
  function commit(q: QueueItem[], debounced = false) {
    queueRef.current = q;
    setQueue(q);
    if (debounced) saver.current.schedule(q);
    else saver.current.saveNow(q);
  }

  async function refreshChapter() {
    const c = parseChapterUrl(await activeTabUrl());
    setChapter((prev) => (prev && c && prev.base === c.base && prev.prefix === c.prefix && prev.number === c.number ? prev : c));
  }

  function addRangeItem(item: Parameters<typeof addItem>[1]): 'added' | 'duplicate' {
    const res = addItem(queueRef.current, item, Date.now(), crypto.randomUUID());
    commit(res.queue);
    return res.duplicate ? 'duplicate' : 'added';
  }

  async function addActiveTab() {
    void refreshChapter();
    setStatus({ s: 'extracting' });
    try {
      const r = await extractActiveTab();
      const res = addItem(queueRef.current, r, Date.now(), crypto.randomUUID());
      commit(res.queue);
      setFocusedId(res.id);
      setStatus({ s: 'idle' });
    } catch (e) {
      if (e instanceof KfError && e.code === 'restricted_page') setStatus({ s: 'info', text: t('restrictedPage') });
      else setStatus({ s: 'error', text: errorMessage(e, t) });
    }
  }

  useEffect(() => {
    void (async () => {
      const saved = await loadQueue();
      queueRef.current = saved;
      setQueue(saved);
      setReady(true);
      void getKindleAddress().then(setKindle, () => setKindle(null));
      void refreshChapter();
      void auth.connectedEmail().then(setAccount, () => setAccount(null));
      if (!autoAdded) {
        autoAdded = true;
        await addActiveTab();
      }
    })();
    const flushNow = () => void saver.current.flush();
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flushNow);
      document.removeEventListener('visibilitychange', onHide);
      flushNow();
    };
  }, []);

  const selected = selectedItems(queue);
  const n = selected.length;
  const focused = queue.find((i) => i.id === focusedId) ?? null;
  const busy = status.s === 'extracting' || status.s === 'sending' || status.s === 'images' || ranging;
  const sendHint = !kindle ? t('hintNeedKindle') : !account ? t('hintNeedAccount') : null;

  // Já sanitizado por htmlToChapter (sem scripts, handlers nem iframes): só então vai para o DOM.
  const previewHtml = useMemo(
    () => (focused && focused.kind !== 'merged' && focused.kind !== 'comic' ? previewBody(htmlToChapter(focused.html, { id: 'c1', title: focused.title })) : ''),
    [focused?.id, focused?.html, focused?.title, focused?.kind],
  );

  function onMerge() {
    const sel = selectedItems(queueRef.current);
    if (sel.length < 2) return;
    const merged = mergeItems(sel, crypto.randomUUID(), Date.now());
    commit([...queueRef.current.map((i) => (i.selected ? { ...i, selected: false } : i)), merged]);
    setFocusedId(merged.id);
  }

  async function onDownload() {
    setNotice(null);
    await saver.current.flush();
    try {
      const { files, failedImages } = await itemsToEpubs(selectedItems(queueRef.current), {
        onProgress: (done, total) => setStatus({ s: 'images', done, total }),
      });
      setStatus({ s: 'idle' });
      if (failedImages > 0) setNotice(t('imagesFailed', [String(failedImages)]));
      for (const [i, f] of files.entries()) {
        if (i > 0) await sleep(DOWNLOAD_GAP_MS);
        download(f);
      }
    } catch (e) {
      setStatus({ s: 'error', text: e instanceof KfError ? errorMessage(e, t) : unexpected(e) });
    }
  }

  async function onSend() {
    setNotice(null);
    await saver.current.flush();
    setStatus({ s: 'sending' });
    try {
      const items = selectedItems(queueRef.current);
      const { files, failedImages } = await itemsToEpubs(items, {
        onProgress: (done, total) => setStatus({ s: 'images', done, total }),
      });
      setStatus({ s: 'sending' });
      const kindleAddress = await getKindleAddress();
      const r = await sendToKindle(files, {
        auth,
        kindleAddress,
        fetchFn: (...a) => fetch(...a),
        onProgress: (sent, total) => setStatus({ s: 'sending', sent, total }),
        subject: items.length === 1 ? items[0]!.title : 'kindlefly',
      });
      if (r.tooLarge.length > 0) {
        setStatus({ s: 'error', text: `${t('error_too_large')} ${r.tooLarge.join(', ')}` });
      } else {
        setStatus({ s: 'sent', count: files.length, to: kindleAddress ?? '' });
        if (failedImages > 0) setNotice(t('imagesFailed', [String(failedImages)]));
      }
    } catch (e) {
      setStatus({ s: 'error', text: errorMessage(e, t) });
    }
  }

  return (
    <section className="screen">
      <button type="button" className="primary" onClick={addActiveTab} disabled={busy || !ready}>
        {t('addToList')}
      </button>

      {chapter && (
        <ChapterRange
          chapter={chapter}
          disabled={busy || !ready}
          onItem={addRangeItem}
          onRunningChange={setRanging}
        />
      )}

      {status.s === 'extracting' && <p role="status">{t('extracting')}</p>}
      {status.s === 'images' && (
        <p role="status">{t('imagesProgress', [String(Math.min(status.done + 1, status.total)), String(status.total)])}</p>
      )}
      {status.s === 'sending' && (
        <p role="status">
          {status.sent !== undefined && status.total !== undefined && status.total > 0
            ? t('sendingProgress', [String(Math.min(status.sent + 1, status.total)), String(status.total)])
            : t('sending')}
        </p>
      )}
      {status.s === 'sent' && (
        <p className="ok" role="status">
          {t('sentCount', [String(status.count), status.to])}
        </p>
      )}
      {status.s === 'info' && (
        <p className="hint" role="status">
          {status.text}
        </p>
      )}
      {notice && (
        <p className="hint" role="status">
          {notice}
        </p>
      )}
      {status.s === 'error' && (
        <p className="error" role="alert">
          {status.text}
        </p>
      )}

      {ready && (
      <QueueList
        queue={queue}
        focusedId={focusedId}
        onFocus={setFocusedId}
        onToggle={(id, sel) => commit(setSelected(queueRef.current, id, sel))}
        onToggleAll={(sel) => commit(setAllSelected(queueRef.current, sel))}
        onRemove={(id) => {
          commit(removeItem(queueRef.current, id));
          if (id === focusedId) setFocusedId(null);
        }}
        onMerge={onMerge}
        onClear={() => {
          commit([]);
          setFocusedId(null);
        }}
      />
      )}

      <div className="row">
        <button type="button" onClick={onDownload} disabled={busy || n === 0}>
          {t('downloadSelected', [String(n)])}
        </button>
        <button type="button" className="primary" onClick={onSend} disabled={busy || n === 0 || sendHint !== null}>
          {t('sendSelected', [String(n)])}
        </button>
      </div>
      {sendHint && <p className="hint">{sendHint}</p>}

      {focused && (
        <>
          <label htmlFor="title">{t('titleLabel')}</label>
          <input
            id="title"
            value={focused.title}
            onChange={(e) => commit(updateMeta(queueRef.current, focused.id, { title: e.target.value }), true)}
          />
          <label htmlFor="author">{t('authorLabel')}</label>
          <input
            id="author"
            value={focused.author}
            onChange={(e) => commit(updateMeta(queueRef.current, focused.id, { author: e.target.value }), true)}
          />
          <h2>{t('previewLabel')}</h2>
          {focused.kind === 'merged' ? (
            <ol className="preview">
              {(focused.parts ?? []).map((p, i) => (
                <li key={i}>{p.images ? `${p.title} (${t('comicPages', [String(p.images.length)])})` : p.title}</li>
              ))}
            </ol>
          ) : focused.kind === 'comic' ? (
            <div className="preview">
              <div className="thumbs">
                {(focused.images ?? [])
                  .filter((u) => /^https?:\/\//i.test(u))
                  .slice(0, 3)
                  .map((u, i) => (
                    <img key={i} src={u} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  ))}
              </div>
              <p>{t('comicPages', [String(focused.images?.length ?? 0)])}</p>
            </div>
          ) : (
            <article className="preview" onClick={onPreviewClick} dangerouslySetInnerHTML={{ __html: previewHtml }} />
          )}
        </>
      )}
    </section>
  );
}
