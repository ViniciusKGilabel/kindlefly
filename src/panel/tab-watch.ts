/** Avisa quando a página da aba ativa muda (troca de aba ou navegação), com atraso para juntar eventos. */

export interface TabChange {
  url?: string;
  status?: string;
}

/** Só interessa a aba ativa, e só quando a URL muda ou o carregamento termina. */
export function isRelevantUpdate(change: TabChange, tab: { active?: boolean }): boolean {
  if (!tab.active) return false;
  return change.url !== undefined || change.status === 'complete';
}

export const TAB_WATCH_DELAY_MS = 400;

export function watchActiveTab(onChange: () => void, delayMs = TAB_WATCH_DELAY_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, delayMs);
  };
  const onActivated = () => fire();
  const onUpdated = (_id: number, change: TabChange, tab: { active?: boolean }) => {
    if (isRelevantUpdate(change, tab)) fire();
  };
  const onFocus = () => fire();
  browser.tabs.onActivated.addListener(onActivated);
  browser.tabs.onUpdated.addListener(onUpdated);
  browser.windows?.onFocusChanged?.addListener(onFocus);
  return () => {
    clearTimeout(timer);
    browser.tabs.onActivated.removeListener(onActivated);
    browser.tabs.onUpdated.removeListener(onUpdated);
    browser.windows?.onFocusChanged?.removeListener(onFocus);
  };
}
