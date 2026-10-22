import { useEffect, useMemo, useRef, useState } from 'react';
import { createGoogleAuth } from '../../src/auth/google';
import { t } from '../../src/core/i18n';
import type { EpubFile } from '../../src/core/types';
import { KfError } from '../../src/core/errors';
import { activeTabUrl, errorMessage, extractActiveTab } from '../../src/panel/extract-active';
import { itemsToEpubs } from '../../src/panel/pipeline';
import { planSendFiles } from '../../src/panel/send-plan';
import { exportNotice, sendFailedText, sentText } from '../../src/panel/send-report';
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
import CurrentPage, { type CurrentState } from './CurrentPage';
import Preview from './Preview';
import QueueList from './QueueList';

type Status =
  | { s: 'idle' }
  | { s: 'images'; done: number; total: number }
  | { s: 'sending'; sent?: number; total?: number }
  | { s: 'sent'; count: number; to: string; tooLarge: number }
  | { s: 'info'; text: string }
  | { s: 'error'; text: string };

const DOWNLOAD_GAP_MS = 300;
const META_SAVE_MS = 400;
// A aba ativa é adicionada uma vez por vida do painel.
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

async function downloadAll(files: EpubFile[]) {
  for (const [i, f] of files.entries()) {
    if (i > 0) await sleep(DOWNLOAD_GAP_MS);
    download(f);
  }
}

function unexpected(e: unknown): string {
  console.warn('[kindlefly]', 'unexpected', e instanceof Error ? e.message : String(e));
  return t('error_unexpected');
}

export default function Home({ active }: { active: boolean }) {
  const auth = useMemo(() => createGoogleAuth(), []);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ s: 'idle' });
  const [notice, setNotice] = useState<string | null>(null);
  /** EPUBs do último envio que não couberam no e-mail (em memória, para baixar sem reconstruir). */
  const [oversize, setOversize] = useState<EpubFile[]>([]);
  const [kindle, setKindle] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [chapter, setChapter] = useState<ChapterUrl | null>(null);
  const [ranging, setRanging] = useState(false);
  const [current, setCurrent] = useState<CurrentState>({ s: 'loading' });
  // A página atual e os capítulos só mudam quando a pessoa clica em Atualizar ou Limpar.
  /** Descarta extrações velhas quando a aba muda no meio de uma leitura. */
  const currentSeq = useRef(0);
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

  /** Lê a página da aba ativa para a caixa "Página atual"; devolve o item, ou null se não deu. */
  async function loadCurrent(): Promise<Omit<QueueItem, 'id' | 'selected' | 'addedAt'> | null> {
    const seq = ++currentSeq.current;
    setCurrent({ s: 'loading' });
    void refreshChapter();
    try {
      const item = await extractActiveTab();
      if (seq === currentSeq.current) setCurrent({ s: 'ready', item });
      return item;
    } catch (e) {
      if (seq !== currentSeq.current) return null;
      if (e instanceof KfError && e.code === 'restricted_page') setCurrent({ s: 'restricted' });
      else setCurrent({ s: 'error', text: errorMessage(e, t) });
      return null;
    }
  }

  /** Adiciona a página atual (a já lida na caixa; lê de novo só se ainda não houver). */
  async function addActiveTab() {
    const item = current.s === 'ready' ? current.item : await loadCurrent();
    if (!item) return;
    setStatus({ s: 'idle' });
    const res = addItem(queueRef.current, item, Date.now(), crypto.randomUUID());
    commit(res.queue);
    setFocusedId(res.id);
  }

  useEffect(() => {
    void (async () => {
      const saved = await loadQueue();
      queueRef.current = saved;
      setQueue(saved);
      setReady(true);
      void refreshChapter();
      const first = !autoAdded;
      autoAdded = true;
      const item = await loadCurrent();
      if (first && item) {
        const res = addItem(queueRef.current, item, Date.now(), crypto.randomUUID());
        commit(res.queue);
        setFocusedId(res.id);
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

  // Home fica montada atrás das Configurações (buscas e envios continuam); ao voltar, relê o que pode ter mudado lá.
  useEffect(() => {
    if (!active) return;
    void getKindleAddress().then(setKindle, () => setKindle(null));
    void auth.connectedEmail().then(setAccount, () => setAccount(null));
  }, [active]);

  function clearCurrent() {
    currentSeq.current++;
    setCurrent({ s: 'empty' });
    setChapter(null);
  }

  const selected = selectedItems(queue);
  const n = selected.length;
  const focused = queue.find((i) => i.id === focusedId) ?? null;
  const busy = status.s === 'sending' || status.s === 'images' || ranging;
  const sendHint = !kindle ? t('hintNeedKindle') : !account ? t('hintNeedAccount') : null;

  const currentUrl = current.s === 'ready' ? current.item.sourceUrl : null;
  const inList = currentUrl !== null && queue.some((i) => i.sourceUrl === currentUrl);

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
      const r = await itemsToEpubs(selectedItems(queueRef.current), {
        onProgress: (done, total) => setStatus({ s: 'images', done, total }),
      });
      setStatus({ s: 'idle' });
      setNotice(exportNotice(r, t));
      await downloadAll(r.files);
    } catch (e) {
      setStatus({ s: 'error', text: e instanceof KfError ? errorMessage(e, t) : unexpected(e) });
    }
  }

  async function onSend() {
    setNotice(null);
    setOversize([]);
    await saver.current.flush();
    setStatus({ s: 'sending' });
    let sentFiles = 0;
    try {
      const items = selectedItems(queueRef.current);
      const plan = await planSendFiles(items, {
        onProgress: (done, total) => setStatus({ s: 'images', done, total }),
      });
      setNotice(exportNotice(plan, t));
      if (plan.files.length === 0 && plan.tooLarge.length === 0) {
        setStatus({ s: 'error', text: t('error_image_failed') });
        return;
      }
      setOversize(plan.tooLarge);
      setStatus({ s: 'sending' });
      const kindleAddress = await getKindleAddress();
      const r = await sendToKindle(plan.files, {
        auth,
        kindleAddress,
        fetchFn: (...a) => fetch(...a),
        onProgress: (sent, total) => setStatus({ s: 'sending', sent, total }),
        onSent: (fs) => {
          sentFiles += fs.length;
        },
        subject: items.length === 1 ? items[0]!.title : 'kindlefly',
      });
      // Pelo planejamento nada passa do limite; por segurança, o que o Gmail recusar também vai para "Baixar".
      const tooLarge = [...plan.tooLarge, ...plan.files.filter((f) => r.tooLarge.includes(f.filename))];
      if (tooLarge.length > plan.tooLarge.length) setOversize(tooLarge);
      setStatus({ s: 'sent', count: sentFiles, to: kindleAddress ?? '', tooLarge: tooLarge.length });
    } catch (e) {
      setStatus({ s: 'error', text: sendFailedText(errorMessage(e, t), sentFiles, t) });
    }
  }

  async function onDownloadOversize() {
    await downloadAll(oversize);
  }

  return (
    <section className="screen" hidden={!active}>
      <CurrentPage
        current={current}
        inList={inList}
        disabled={busy || !ready}
        locked={ranging}
        onRefresh={() => void loadCurrent()}
        onClear={clearCurrent}
        onAdd={() => void addActiveTab()}
      />

      {chapter && (
        <ChapterRange
          chapter={chapter}
          disabled={busy || !ready}
          onItem={addRangeItem}
          onRunningChange={setRanging}
        />
      )}

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
          {sentText({ sent: status.count, to: status.to, tooLarge: status.tooLarge }, t)}
        </p>
      )}
      {oversize.length > 0 && !busy && (
        <button type="button" data-testid="download-too-large" onClick={onDownloadOversize}>
          {t('downloadTooLarge')}
        </button>
      )}
      {status.s === 'info' && (
        <p className="hint" role="status">
          {status.text}
        </p>
      )}
      {notice && (
        <p className="hint" role="status" data-testid="notice">
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
        <button type="button" data-testid="download" onClick={onDownload} disabled={busy || n === 0}>
          {t('downloadSelected', [String(n)])}
        </button>
        <button type="button" className="primary" onClick={onSend} disabled={busy || n === 0 || sendHint !== null}>
          {t('sendSelected', [String(n)])}
        </button>
      </div>
      {sendHint && <p className="hint">{sendHint}</p>}

      {focused && (
        <>
          <div className="current-head">
            <h2>{t('itemLabel')}</h2>
            <button type="button" className="icon" data-testid="close-item" aria-label={t('closeItem')} title={t('closeItem')} onClick={() => setFocusedId(null)}>
              ×
            </button>
          </div>
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
          <Preview item={focused} />
        </>
      )}
    </section>
  );
}
