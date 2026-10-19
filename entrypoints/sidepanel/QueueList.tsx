import { t } from '../../src/core/i18n';
import type { QueueItem } from '../../src/queue/queue';

interface Props {
  queue: QueueItem[];
  focusedId: string | null;
  onFocus: (id: string) => void;
  onToggle: (id: string, selected: boolean) => void;
  onToggleAll: (selected: boolean) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export default function QueueList({ queue, focusedId, onFocus, onToggle, onToggleAll, onRemove, onClear }: Props) {
  if (queue.length === 0) return <p className="hint">{t('emptyList')}</p>;
  const allSelected = queue.every((i) => i.selected);
  return (
    <div className="queue">
      <div className="queue-head">
        <label className="check">
          <input type="checkbox" checked={allSelected} onChange={(e) => onToggleAll(e.target.checked)} />
          {t('selectAll')}
        </label>
        <button type="button" onClick={onClear}>
          {t('clearList')}
        </button>
      </div>
      <ul>
        {queue.map((i) => (
          <li key={i.id} className={i.id === focusedId ? 'focused' : undefined}>
            <input
              type="checkbox"
              aria-label={t('selectItem', [i.title])}
              checked={i.selected}
              onChange={(e) => onToggle(i.id, e.target.checked)}
            />
            <button type="button" className="name" onClick={() => onFocus(i.id)} title={i.title}>
              {i.title || i.sourceUrl}
            </button>
            <button
              type="button"
              className="icon"
              aria-label={`${t('remove')}: ${i.title}`}
              title={t('remove')}
              onClick={() => onRemove(i.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
