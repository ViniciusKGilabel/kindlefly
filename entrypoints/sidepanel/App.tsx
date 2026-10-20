import { useState } from 'react';
import { t } from '../../src/core/i18n';
import Home from './Home';
import Settings from './Settings';
import './styles.css';

export default function App() {
  const [view, setView] = useState<'main' | 'settings'>('main');
  return (
    <div className="app">
      <header className="bar">
        <h1>{t('extName')}</h1>
        <button
          type="button"
          className="icon"
          aria-label={view === 'main' ? t('settings') : t('back')}
          title={view === 'main' ? t('settings') : t('back')}
          onClick={() => setView(view === 'main' ? 'settings' : 'main')}
        >
          {view === 'main' ? '⚙' : '←'}
        </button>
      </header>
      {view === 'main' ? <Home /> : <Settings />}
    </div>
  );
}
