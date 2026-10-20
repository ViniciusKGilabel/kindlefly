import { useEffect, useRef, useState } from 'react';
import { t } from '../../src/core/i18n';
import type { ExtractedItem } from '../../src/core/types';
import { RANGE_MAX, validateRange, type ChapterUrl } from '../../src/range/chapter-url';
import { fetchChapter } from '../../src/range/fetch-chapter';
import { runRange } from '../../src/range/run-range';

interface Props {
  chapter: ChapterUrl;
  /** Outra operação em andamento (extração/envio). */
  disabled: boolean;
  onItem: (item: Omit<ExtractedItem, 'id'>) => 'added' | 'duplicate';
  onRunningChange: (running: boolean) => void;
}

export default function ChapterRange({ chapter, disabled, onItem, onRunningChange }: Props) {
  const [from, setFrom] = useState(String(chapter.number));
  const [to, setTo] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onItemRef = useRef(onItem);
  onItemRef.current = onItem;

  useEffect(() => {
    setFrom(String(chapter.number));
    setTo('');
  }, [chapter.base, chapter.prefix, chapter.number]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const running = progress !== null;
  const f = from.trim() === '' ? Number.NaN : Number(from);
  const tt = to.trim() === '' ? Number.NaN : Number(to);
  const validity = to.trim() === '' ? 'empty' : validateRange(f, tt);
  const error =
    validity === 'invalid' ? t('rangeInvalid') : validity === 'too_many' ? t('rangeTooMany', [String(RANGE_MAX)]) : null;

  function clear() {
    setFrom(String(chapter.number));
    setTo('');
    setSummary(null);
  }

  async function start() {
    const ac = new AbortController();
    abortRef.current = ac;
    setSummary(null);
    setProgress({ done: 0, total: tt - f + 1 });
    onRunningChange(true);
    try {
      const r = await runRange({
        chapter,
        from: f,
        to: tt,
        signal: ac.signal,
        fetchChapter: (url, signal) => fetchChapter(url, (...a) => fetch(...a), signal),
        onItem: (item) => onItemRef.current(item),
        onProgress: (done, total) => setProgress({ done, total }),
      });
      const text =
        r.failed.length > 0
          ? t('rangeSummaryFailed', [String(r.added), String(r.duplicates), String(r.failed.length), (r.failed.length > 10 ? `${r.failed.slice(0, 10).join(', ')}…` : r.failed.join(', '))])
          : t('rangeSummaryOk', [String(r.added), String(r.duplicates)]);
      setSummary(r.cancelled ? `${t('rangeCancelled')} ${text}` : text);
    } catch (e) {
      console.warn('[kindlefly]', 'range', e instanceof Error ? e.name : 'error');
      setSummary(t('error_unexpected'));
    } finally {
      abortRef.current = null;
      setProgress(null);
      onRunningChange(false);
    }
  }

  return (
    <div className="range">
      <div className="row">
        <label htmlFor="range-from">{t('rangeLabel')}: {t('rangeFrom')}</label>
        <input
          id="range-from" data-testid="range-from" type="number" inputMode="numeric" min={0} value={from}
          disabled={running} onChange={(e) => setFrom(e.target.value)}
        />
        <label htmlFor="range-to">{t('rangeTo')}</label>
        <input
          id="range-to" data-testid="range-to" type="number" inputMode="numeric" min={0} value={to}
          disabled={running} onChange={(e) => setTo(e.target.value)}
        />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {running ? (
        <div className="row">
          <p role="status" className="grow">{t('rangeFetching', [String(Math.min(progress.done + 1, progress.total)), String(progress.total)])}</p>
          <button type="button" onClick={() => abortRef.current?.abort()}>{t('rangeCancel')}</button>
        </div>
      ) : (
        <div className="row">
          <button type="button" data-testid="range-add" onClick={start} disabled={disabled || validity !== 'ok'}>{t('rangeAdd')}</button>
          <button type="button" data-testid="range-clear" onClick={clear}>{t('rangeClear')}</button>
        </div>
      )}
      {summary && <p className="hint" role="status" data-testid="range-summary">{summary}</p>}
    </div>
  );
}
