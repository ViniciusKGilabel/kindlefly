import { useEffect, useMemo, useState } from 'react';
import { createGoogleAuth } from '../../src/auth/google';
import { t } from '../../src/core/i18n';
import { errorMessage } from '../../src/panel/extract-active';
import { getGrayscale, getKindleAddress, setGrayscale, setKindleAddress } from '../../src/settings/store';

export default function Settings() {
  const auth = useMemo(() => createGoogleAuth(), []);
  const [address, setAddress] = useState('');
  const [gray, setGray] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const hasClientId = Boolean(import.meta.env.WXT_GOOGLE_CLIENT_ID);

  useEffect(() => {
    void getKindleAddress().then((a) => setAddress(a ?? ''));
    void getGrayscale().then(setGray);
    void auth.connectedEmail().then(setEmail);
  }, [auth]);

  async function save() {
    try {
      await setKindleAddress(address);
      setMsg({ kind: 'ok', text: t('saved') });
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e, t) });
    }
  }

  async function connect() {
    setBusy(true);
    setMsg(null);
    try {
      setEmail(await auth.connect());
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e, t) });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await auth.disconnect();
      setEmail(null);
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e, t) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="screen">
      <h2>{t('googleAccount')}</h2>
      {!hasClientId && <p className="notice">{t('clientIdMissing')}</p>}
      {email ? (
        <div className="row">
          <span>{t('connectedAs', [email])}</span>
          <button type="button" onClick={disconnect} disabled={busy}>
            {t('disconnect')}
          </button>
        </div>
      ) : (
        <button type="button" className="primary" onClick={connect} disabled={busy || !hasClientId}>
          {t('connectGoogle')}
        </button>
      )}

      <label htmlFor="kindle">{t('kindleAddressLabel')}</label>
      <div className="row">
        <input
          id="kindle"
          type="email"
          value={address}
          placeholder={t('kindleAddressPlaceholder')}
          onChange={(e) => {
            setAddress(e.target.value);
            setMsg(null);
          }}
        />
        <button type="button" onClick={save}>
          {t('save')}
        </button>
      </div>
      <p className="hint">{t('amazonReminder')}</p>

      <label className="row" htmlFor="gray">
        <input
          id="gray"
          type="checkbox"
          checked={gray}
          onChange={(e) => {
            setGray(e.target.checked);
            void setGrayscale(e.target.checked);
          }}
        />
        {t('grayscaleImages')}
      </label>
      {msg && (
        <p className={msg.kind === 'error' ? 'error' : 'ok'} role="status">
          {msg.text}
        </p>
      )}
    </section>
  );
}
