import { t } from '../../src/core/i18n';
import type { ExtractedItem } from '../../src/core/types';
import Preview from './Preview';

export type CurrentState =
  | { s: 'empty' }
  | { s: 'loading' }
  | { s: 'ready'; item: Omit<ExtractedItem, 'id'> }
  | { s: 'restricted' }
  | { s: 'error'; text: string };

interface Props {
  current: CurrentState;
  inList: boolean;
  disabled: boolean;
  /** Busca de capítulos em andamento: a página fica presa até terminar. */
  locked: boolean;
  onRefresh: () => void;
  onClear: () => void;
  onAdd: () => void;
}

/** Caixa da página aberta na aba ativa: prévia, atualizar e adicionar à lista. */
export default function CurrentPage({ current, inList, disabled, locked, onRefresh, onClear, onAdd }: Props) {
  return (
    <div className="current" data-testid="current-page">
      <div className="current-head">
        <h2>{t('currentPage')}</h2>
        <div className="row">
          <button type="button" data-testid="refresh-page" onClick={onRefresh} disabled={locked || current.s === 'loading'}>
            {t('refreshPage')}
          </button>
          <button type="button" data-testid="clear-page" onClick={onClear} disabled={locked || current.s === 'empty'}>
            {t('rangeClear')}
          </button>
        </div>
      </div>
      {current.s === 'empty' && <p className="hint">{t('currentEmpty')}</p>}
      {current.s === 'loading' && <p className="hint" role="status">{t('extracting')}</p>}
      {current.s === 'restricted' && <p className="hint">{t('restrictedPage')}</p>}
      {current.s === 'error' && <p className="error" role="alert">{current.text}</p>}
      {current.s === 'ready' && (
        <>
          <p className="current-title" data-testid="current-title" title={current.item.title}>{current.item.title}</p>
          <div className="current-preview">
            <Preview item={current.item} testId="current-preview" />
          </div>
        </>
      )}
      <button
        type="button"
        className="primary"
        data-testid="add-to-list"
        onClick={onAdd}
        disabled={disabled || current.s === 'restricted' || current.s === 'empty'}
      >
        {inList ? t('inList') : t('addToList')}
      </button>
    </div>
  );
}
