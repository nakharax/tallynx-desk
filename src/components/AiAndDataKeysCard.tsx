import { useEffect, useId, useRef, useState } from 'react';
import { Database, KeyRound, X } from 'lucide-react';
import { auth } from '../services/firebase';
import {
  AI_HEADERS, AI_MODEL_CATALOG, asRecord, buildDatabentoRequestHeaders, buildDeskAiRequestHeaders,
  maskCredential, normalizeAiModel, normalizeAiProvider, parseCodexCallbackInput, readCodexOauthCredential,
  type AiProvider, type PlatformAiRole,
} from '../utils/aiProviderConfig';
import {
  loadByokCredentials, refreshCodexOauthIfNeeded, saveByokCredentials, useByokCredentials, type ByokCredentials,
} from '../utils/byokStorage';
import { deskText, type DeskLanguage } from '../utils/deskI18n';
import { DeskDialog } from './DeskDialog';
import './AiAndDataKeysCard.css';

const PROVIDER_LABELS: Record<AiProvider, string> = {
  platform: 'Platform Sovereign Gemini',
  google: 'Google Gemini BYOK',
  openrouter: 'OpenRouter API',
  codex_oauth: 'OpenAI / Codex OAuth',
};

interface CardProps {
  uid: string | null;
  lang: DeskLanguage;
}

type Translate = (en: string, th: string) => string;
type PlatformStatus = { platformEligible: boolean; platformConfigured: boolean; role: PlatformAiRole };
type OAuthAttempt = { verifier: string; state: string; redirectUri: string; expiresAt: number };

async function verifyKey(headers: Record<string, string>): Promise<boolean> {
  if (!headers[AI_HEADERS.key] && !headers[AI_HEADERS.databento]) return false;
  const response = await fetch('/api/ai/byok/verify', {
    method: 'POST', headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12_000),
  });
  return response.ok;
}

function KeyField({ label, saved, hint, t, onSave, onClear, onVerify }: {
  label: string;
  saved?: string;
  hint: string;
  t: Translate;
  onSave: (key: string) => boolean;
  onClear: () => boolean;
  onVerify: (key: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState('');
  const [feedback, setFeedback] = useState('');
  const [checking, setChecking] = useState(false);
  const id = useId();
  const key = value.trim();
  async function verify() {
    setChecking(true);
    setFeedback('');
    try {
      const accepted = await onVerify(key || saved || '');
      setFeedback(accepted ? t('Credential verified.', 'ยืนยันข้อมูลรับรองแล้ว') : t('The provider could not verify this key.', 'ผู้ให้บริการไม่สามารถยืนยันคีย์นี้ได้'));
    } catch {
      setFeedback(t('Verification is unavailable. Try again.', 'ไม่สามารถตรวจสอบได้ ลองอีกครั้ง'));
    } finally {
      setChecking(false);
    }
  }
  return (
    <div className="byok-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="inp mono" type="password" value={value} autoComplete="off" spellCheck={false}
        placeholder={maskCredential(saved) || hint} maxLength={8_000} disabled={checking}
        onChange={event => { setValue(event.target.value); setFeedback(''); }} />
      <div className="byok-actions">
        <button type="button" className="btn sm primary" disabled={!key || checking} onClick={() => {
          const savedOk = onSave(key);
          if (savedOk) setValue('');
          setFeedback(savedOk ? t('Saved on this browser.', 'บันทึกในเบราว์เซอร์นี้แล้ว') : t('Check the key format and browser storage.', 'ตรวจสอบรูปแบบคีย์และพื้นที่เก็บข้อมูลของเบราว์เซอร์'));
        }}>{t('Save key', 'บันทึกคีย์')}</button>
        <button type="button" className="btn sm" disabled={(!key && !saved) || checking} onClick={() => void verify()}>
          {checking ? t('Verifying…', 'กำลังตรวจสอบ…') : t('Verify', 'ตรวจสอบ')}
        </button>
        <button type="button" className="btn sm" disabled={(!saved && !key) || checking} onClick={() => {
          const removed = !saved || onClear();
          setValue('');
          setFeedback(removed ? t('Key cleared.', 'ล้างคีย์แล้ว') : t('Could not update browser storage.', 'ไม่สามารถอัปเดตข้อมูลในเบราว์เซอร์ได้'));
        }}>{t('Clear', 'ล้าง')}</button>
      </div>
      {feedback && <span className="byok-feedback" role="status">{feedback}</span>}
    </div>
  );
}

function ModelPicker({ provider, model, t, onSave }: {
  provider: AiProvider; model: string; t: Translate; onSave: (model: string) => boolean;
}) {
  const catalog: readonly string[] = AI_MODEL_CATALOG[provider];
  const [editingCustom, setEditingCustom] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const preset = catalog.includes(model);
  const custom = editingCustom || !preset;
  const customModel = draft ?? (preset ? '' : model);
  return (
    <div className="byok-field">
      <label>
        {t('Model', 'โมเดล')}
        <select className="inp mono" value={custom ? '_custom' : model} onChange={event => {
          const next = event.target.value;
          setEditingCustom(next === '_custom');
          setDraft(null);
          setFeedback(next === '_custom' || onSave(next) ? '' : t('Could not save the model.', 'บันทึกโมเดลไม่สำเร็จ'));
        }}>
          {catalog.map(item => <option key={item} value={item}>{item === 'auto' ? t('Auto · Decision-1', 'อัตโนมัติ · Decision-1') : item}</option>)}
          {provider !== 'platform' && <option value="_custom">{t('Custom model ID', 'ระบุ ID โมเดลเอง')}</option>}
        </select>
      </label>
      {custom && <div className="byok-actions">
        <input className="inp mono" aria-label={t('Custom model ID', 'ID โมเดลที่กำหนดเอง')} value={customModel}
          maxLength={128} autoComplete="off" spellCheck={false} onChange={event => setDraft(event.target.value)} />
        <button className="btn sm primary" type="button" disabled={!customModel.trim()} onClick={() => {
          const valid = normalizeAiModel(provider, customModel);
          const saved = valid && onSave(valid);
          if (saved) setDraft(null);
          setFeedback(saved ? t('Model saved.', 'บันทึกโมเดลแล้ว') : t('Check the model ID and browser storage.', 'ตรวจสอบ ID โมเดลและพื้นที่เก็บข้อมูลของเบราว์เซอร์'));
        }}>{t('Save model', 'บันทึกโมเดล')}</button>
      </div>}
      {feedback && <span className="byok-feedback" role="status">{feedback}</span>}
    </div>
  );
}

const CODEX_ATTEMPT_STORAGE_KEY = 'TALLYNX_CODEX_OAUTH_ATTEMPT_V1';

type StoredCodexAttempt = OAuthAttempt & { authorizationUrl?: string };

function readStoredCodexAttempt(): StoredCodexAttempt | null {
  try {
    const raw = window.sessionStorage.getItem(CODEX_ATTEMPT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = asRecord(JSON.parse(raw));
    if (
      !parsed ||
      typeof parsed.verifier !== 'string' ||
      typeof parsed.state !== 'string' ||
      typeof parsed.redirectUri !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      parsed.expiresAt <= Date.now()
    ) {
      window.sessionStorage.removeItem(CODEX_ATTEMPT_STORAGE_KEY);
      return null;
    }
    return {
      verifier: parsed.verifier,
      state: parsed.state,
      redirectUri: parsed.redirectUri,
      expiresAt: parsed.expiresAt,
      authorizationUrl: typeof parsed.authorizationUrl === 'string' ? parsed.authorizationUrl : undefined,
    };
  } catch {
    return null;
  }
}

function writeStoredCodexAttempt(next: StoredCodexAttempt | null): void {
  try {
    if (!next) window.sessionStorage.removeItem(CODEX_ATTEMPT_STORAGE_KEY);
    else window.sessionStorage.setItem(CODEX_ATTEMPT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage errors in restricted browsing modes.
  }
}

function CodexConnection({ uid, credentials, t, update }: {
  uid: string | null; credentials: ByokCredentials; t: Translate;
  update: (patch: Partial<ByokCredentials>) => boolean;
}) {
  const [attempt, setAttemptState] = useState<StoredCodexAttempt | null>(() => readStoredCodexAttempt());
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);
  const setAttempt = (next: StoredCodexAttempt | null) => {
    writeStoredCodexAttempt(next);
    setAttemptState(next);
  };
  const saved = credentials.openAiKey ?? credentials.codex?.accessToken;
  async function start() {
    if (activeRequest.current) return;
    const popup = window.open('about:blank', '_blank');
    const request = new AbortController();
    activeRequest.current = request;
    setBusy(true);
    setFeedback('');
    try {
      const response = await fetch('/api/ai/codex-oauth/start', {
        method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]),
      });
      const data = asRecord(await response.json());
      request.signal.throwIfAborted();
      if (!response.ok || typeof data?.authorizationUrl !== 'string' || typeof data.verifier !== 'string' ||
          typeof data.state !== 'string' || typeof data.redirectUri !== 'string' || typeof data.expiresAt !== 'number') throw new Error();
      const authorize = new URL(data.authorizationUrl);
      if (authorize.origin !== 'https://auth.openai.com' || authorize.pathname !== '/oauth/authorize') throw new Error();
      if (popup && !popup.closed) {
        popup.location.replace(authorize.href);
        try { popup.opener = null; } catch { /* cross-origin already detached */ }
      }
      setAttempt({
        verifier: data.verifier,
        state: data.state,
        redirectUri: data.redirectUri,
        expiresAt: data.expiresAt,
        authorizationUrl: authorize.href,
      });
      setFeedback(
        popup
          ? t(
              'Sign in on OpenAI. When redirected to localhost:1455 ("site can’t be reached" is normal), copy the full URL from that tab’s address bar, paste it below, and click Connect.',
              'ล็อกอินในหน้า OpenAI พอเด้งไปหน้า localhost:1455 (ขึ้นเปิดไม่ได้ถือว่าปกติ) ให้คัดลอก URL ทั้งหมดจากช่อง address bar ของแท็บนั้นมาวางด้านล่างแล้วกด "เชื่อมต่อ"'
            )
          : t(
              'Popup was blocked. Open the sign-in link below, then copy the localhost:1455 callback URL back here.',
              'เบราว์เซอร์บล็อกป๊อปอัป กดลิงก์เข้าสู่ระบบด้านล่าง แล้วคัดลอก URL callback ของ localhost:1455 กลับมาวางที่นี่'
            )
      );
    } catch {
      if (popup && !popup.closed) popup.close();
      if (!request.signal.aborted) setFeedback(t('Could not start Codex sign-in. Try again.', 'เริ่มเข้าสู่ระบบ Codex ไม่สำเร็จ โปรดลองอีกครั้ง'));
    } finally {
      if (activeRequest.current === request) activeRequest.current = null;
      setBusy(false);
    }
  }
  async function connectRaw(rawText: string) {
    if (activeRequest.current) return;
    const currentAttempt = attempt && attempt.expiresAt > Date.now() ? attempt : readStoredCodexAttempt();
    const parsed = parseCodexCallbackInput(rawText, currentAttempt?.redirectUri);
    if (!parsed) {
      setFeedback(t(
        'Enter the full localhost:1455 callback URL, authorization code, ~/.codex/auth.json, or OpenAI API key (sk-...).',
        'วาง URL callback เต็มของ localhost:1455, รหัสอนุญาต, ไฟล์ ~/.codex/auth.json หรือคีย์ OpenAI API (sk-...)'
      ));
      return;
    }
    const request = new AbortController();
    activeRequest.current = request;
    setBusy(true);
    try {
      let patch: Partial<ByokCredentials>;
      if (parsed.kind === 'code') {
        if (!currentAttempt || currentAttempt.expiresAt <= Date.now() || (parsed.state && parsed.state !== currentAttempt.state)) {
          setFeedback(t(
            'This callback does not match an active sign-in session (or expired after 10m). Click "Start Codex sign-in" again and paste the new localhost:1455 URL.',
            'URL callback นี้ไม่ตรงกับรอบล็อกอินปัจจุบัน (หรือหมดอายุเกิน 10 นาที) กรุณากด "เริ่มเข้าสู่ระบบ Codex" ใหม่แล้วนำ URL localhost:1455 รอบใหม่มาวาง'
          ));
          return;
        }
        const response = await fetch('/api/ai/codex-oauth/exchange', {
          method: 'POST', redirect: 'error', cache: 'no-store',
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(16_000)]),
          headers: {
            [AI_HEADERS.oauthCode]: parsed.code,
            [AI_HEADERS.oauthVerifier]: currentAttempt.verifier,
            [AI_HEADERS.oauthState]: currentAttempt.state,
          },
        });
        const payload = asRecord(await response.json().catch(() => null));
        const codex = readCodexOauthCredential(payload?.credential);
        if (!response.ok || !codex) {
          const detail = typeof payload?.detail === 'string' ? ` (${payload.detail})` : '';
          throw new Error(detail);
        }
        setAttempt(null);
        patch = { provider: 'codex_oauth', codex, openAiKey: undefined };
      } else if (parsed.kind === 'oauth') {
        patch = { provider: 'codex_oauth', codex: parsed.credential, openAiKey: undefined };
      } else {
        patch = { provider: 'codex_oauth', openAiKey: parsed.key, codex: undefined };
      }
      if (request.signal.aborted) return;
      if (!update(patch)) {
        setFeedback(t('Could not save credentials in browser storage.', 'บันทึกข้อมูลรับรองในเบราว์เซอร์ไม่สำเร็จ'));
        return;
      }
      setAttempt(null);
      setInput('');
      const connectedIdentity = patch.codex?.accountEmail
        ? ` (${patch.codex.accountEmail}${patch.codex.planType ? ` · ${patch.codex.planType}` : ''})`
        : '';
      setFeedback(t(`Codex connected and saved on this browser${connectedIdentity}.`, `เชื่อมต่อและบันทึก Codex ในเบราว์เซอร์นี้แล้ว${connectedIdentity}`));
    } catch (err) {
      const detail = err instanceof Error && err.message ? err.message : '';
      if (!request.signal.aborted) {
        setFeedback(t(
          `Codex could not connect${detail}. Start a new sign-in or import ~/.codex/auth.json instead.`,
          `เชื่อมต่อ Codex ไม่สำเร็จ${detail} ลองกด "เริ่มเข้าสู่ระบบ Codex" ใหม่ หรือกด "นำเข้า auth.json" แทน`
        ));
      }
    } finally {
      if (activeRequest.current === request) activeRequest.current = null;
      setBusy(false);
    }
  }
  async function connect() {
    await connectRaw(input);
  }
  async function handleImportAuthJson(file: File | null | undefined) {
    if (!file) return;
    try {
      const text = (await file.text()).slice(0, 64_000);
      setInput(text);
      await connectRaw(text);
    } catch {
      setFeedback(t('Could not read the selected auth.json file.', 'ไม่สามารถอ่านไฟล์ auth.json ที่เลือกได้'));
    }
  }
  async function verify() {
    setBusy(true);
    try {
      const data = await refreshCodexOauthIfNeeded(uid);
      const headers = buildDeskAiRequestHeaders({
        provider: 'codex_oauth', key: data.openAiKey ?? data.codex?.accessToken, chatgptAccountId: data.codex?.chatgptAccountId,
      });
      const valid = await verifyKey(headers);
      setFeedback(valid ? t('Credential verified.', 'ยืนยันข้อมูลรับรองแล้ว') : t('Verification failed. Reconnect or check the credential.', 'ตรวจสอบไม่สำเร็จ โปรดเชื่อมต่อใหม่หรือตรวจสอบข้อมูลรับรอง'));
    } catch {
      setFeedback(t('Verification is unavailable. Try again.', 'ไม่สามารถตรวจสอบได้ ลองอีกครั้ง'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="byok-field">
      {saved && <div className="byok-identity">
        <span className="mono">{maskCredential(saved)}</span>
        <span>{credentials.codex?.accountEmail || (credentials.openAiKey ? 'OpenAI API' : 'Codex OAuth')}</span>
        {credentials.codex?.planType && <span className="pill">{credentials.codex.planType}</span>}
      </div>}
      <label>
        {t('Callback URL (localhost:1455), auth.json, or OpenAI API key', 'URL callback (localhost:1455), ไฟล์ auth.json หรือคีย์ OpenAI API')}
        <input className="inp mono" type="password" value={input} maxLength={64_000} autoComplete="off" spellCheck={false} disabled={busy}
          placeholder="http://localhost:1455/auth/callback?code=...&state=..."
          onChange={event => setInput(event.target.value)}
          onPaste={event => {
            event.preventDefault();
            setInput(event.clipboardData.getData('text').slice(0, 64_000));
          }} />
      </label>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={event => {
          const selected = event.target.files?.[0];
          event.target.value = '';
          void handleImportAuthJson(selected);
        }}
      />
      <div className="byok-actions">
        <button type="button" className="btn sm" disabled={busy} onClick={() => void start()}>{t('Start Codex sign-in', 'เริ่มเข้าสู่ระบบ Codex')}</button>
        <button type="button" className="btn sm primary" disabled={busy || !input.trim()} onClick={() => void connect()}>{t('Connect', 'เชื่อมต่อ')}</button>
        <button type="button" className="btn sm" disabled={busy} onClick={() => fileInputRef.current?.click()}>{t('Import auth.json', 'นำเข้า auth.json')}</button>
        <button type="button" className="btn sm" disabled={busy || !saved} onClick={() => void verify()}>{t('Verify', 'ตรวจสอบ')}</button>
        <button type="button" className="btn sm" disabled={busy || (!saved && !input && !attempt)} onClick={() => {
          const removed = update({ codex: undefined, openAiKey: undefined });
          setAttempt(null);
          setInput('');
          setFeedback(removed ? t('Credential cleared.', 'ล้างข้อมูลรับรองแล้ว') : t('Could not update browser storage.', 'ไม่สามารถอัปเดตข้อมูลในเบราว์เซอร์ได้'));
        }}>{t('Clear', 'ล้าง')}</button>
      </div>
      {attempt?.authorizationUrl && attempt.expiresAt > Date.now() && (
        <p className="byok-feedback">
          <a href={attempt.authorizationUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
            {t('Open OpenAI sign-in page again ↗', 'เปิดหน้าล็อกอิน OpenAI อีกครั้ง ↗')}
          </a>
        </p>
      )}
      {feedback && <span className="byok-feedback" role="status">{feedback}</span>}
    </div>
  );
}

export function AiAndDataKeysCard({ uid, lang }: CardProps) {
  return <ScopedAiAndDataKeysCard key={uid === null ? 'guest' : `user:${uid}`} uid={uid} lang={lang} />;
}

function ScopedAiAndDataKeysCard({ uid, lang }: CardProps) {
  const t: Translate = (en, th) => deskText(lang, en, th);
  const credentials = useByokCredentials(uid);
  const [status, setStatus] = useState<PlatformStatus | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    let activeRequest: AbortController | undefined;
    async function loadStatus() {
      activeRequest?.abort();
      const controller = new AbortController();
      activeRequest = controller;
      try {
        const user = auth.currentUser;
        const token = user && user.uid === uid ? await user.getIdToken().catch(() => undefined) : undefined;
        const response = await fetch('/api/ai/provider-status', {
          headers: buildDeskAiRequestHeaders(undefined, token),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]), redirect: 'error', cache: 'no-store',
        });
        const data = asRecord(await response.json());
        if (!response.ok || typeof data?.platformEligible !== 'boolean') throw new Error();
        const role = data.role === 'ADMIN' || data.role === 'FOUNDER' || data.role === 'LIFETIME' ? data.role : null;
        if (!controller.signal.aborted) {
          setStatus({ platformEligible: data.platformEligible, platformConfigured: data.platformConfigured === true, role });
          setStatusFailed(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setStatus(null);
          setStatusFailed(true);
        }
      }
    }
    void loadStatus();
    window.addEventListener('focus', loadStatus);
    return () => { activeRequest?.abort(); window.removeEventListener('focus', loadStatus); };
  }, [uid]);

  function update(patch: Partial<ByokCredentials>) {
    if ((auth.currentUser?.uid ?? null) !== uid) return false;
    const saved = saveByokCredentials(uid, { ...loadByokCredentials(uid), ...patch });
    setStorageError(!saved);
    return saved;
  }

  const eligible = status?.platformEligible === true;
  const provider = credentials.provider === 'platform' && !eligible
    ? undefined : credentials.provider ?? (eligible && status.platformConfigured ? 'platform' : undefined);
  const role = status?.role;
  const roleLabel = role === 'FOUNDER' ? t('Founder eligible', 'ผู้ก่อตั้งมีสิทธิ์')
    : role === 'ADMIN' ? t('Admin eligible', 'ผู้ดูแลมีสิทธิ์')
    : role === 'LIFETIME' ? t('Lifetime eligible', 'บัญชี Lifetime มีสิทธิ์')
    : statusFailed ? t('Platform status unavailable', 'ตรวจสอบสิทธิ์แพลตฟอร์มไม่ได้')
    : status ? t('BYOK required', 'ต้องใช้คีย์ของคุณ') : t('Checking platform access…', 'กำลังตรวจสอบสิทธิ์แพลตฟอร์ม…');
  const providerOptions: AiProvider[] = eligible
    ? ['platform', 'google', 'openrouter', 'codex_oauth'] : ['google', 'openrouter', 'codex_oauth'];
  return (
    <section className="card byok-card">
      <header className="byok-heading">
        <div>
          <h2 className="card-title desk-icon-title"><KeyRound size={17} aria-hidden="true" />{t('AI & Data Keys', 'คีย์ AI และข้อมูล')}</h2>
          <p>{t('Credentials are saved in this browser for the current Desk account or guest profile.', 'คีย์จะถูกบันทึกในเบราว์เซอร์นี้สำหรับบัญชี Desk หรือโปรไฟล์ผู้เยี่ยมชมปัจจุบัน')}</p>
        </div>
        <span className="byok-access" data-eligible={eligible} role="status">{roleLabel}</span>
      </header>
      <div className="byok-grid">
        <div className="byok-provider">
          <label className="byok-field">
            {t('AI provider', 'ผู้ให้บริการ AI')}
            <select className="inp" value={provider ?? ''} onChange={event => {
              const next = normalizeAiProvider(event.target.value);
              if (next) update({ provider: next });
            }}>
              <option value="" disabled>{t('Choose a provider', 'เลือกผู้ให้บริการ')}</option>
              {providerOptions.map(value => <option key={value} value={value}>{PROVIDER_LABELS[value]}</option>)}
            </select>
          </label>
          {provider && <ModelPicker key={provider} provider={provider} t={t}
            model={credentials.models[provider] ?? AI_MODEL_CATALOG[provider][0]}
            onSave={model => update({ provider, models: { ...loadByokCredentials(uid).models, [provider]: model } })} />}
          {provider === 'platform' && !status?.platformConfigured &&
            <p className="byok-feedback">{t('Platform Gemini is currently unavailable.', 'ขณะนี้ Gemini ของแพลตฟอร์มไม่พร้อมใช้งาน')}</p>}
          {(provider === 'google' || provider === 'openrouter') && <KeyField key={provider} t={t}
            label={provider === 'google' ? t('Google AI Studio key', 'คีย์ Google AI Studio') : t('OpenRouter API key', 'คีย์ OpenRouter API')}
            hint={provider === 'google' ? 'AIza…' : 'sk-or-v1-…'}
            saved={provider === 'google' ? credentials.googleKey : credentials.openrouterKey}
            onClear={() => update(provider === 'google' ? { googleKey: undefined } : { openrouterKey: undefined })}
            onSave={key => Boolean(buildDeskAiRequestHeaders({ provider, key })[AI_HEADERS.key]) &&
              update(provider === 'google' ? { provider, googleKey: key } : { provider, openrouterKey: key })}
            onVerify={key => verifyKey(buildDeskAiRequestHeaders({ provider, key }))} />}
          {provider === 'codex_oauth' && <CodexConnection uid={uid} credentials={credentials} t={t} update={update} />}
          {(provider === 'openrouter' || provider === 'codex_oauth') &&
            <p className="byok-feedback">{t('This provider handles text. Cloud voice and Live use a Google Gemini key.', 'ผู้ให้บริการนี้ใช้กับข้อความ ส่วนเสียงบนคลาวด์และ Live ใช้คีย์ Google Gemini')}</p>}
        </div>
        <div className="byok-databento">
          <h3><Database size={15} aria-hidden="true" /> Databento</h3>
          <p>{t('Your personal key for the COMEX data bridge.', 'คีย์ส่วนตัวสำหรับการเชื่อมต่อข้อมูล COMEX')}</p>
          <KeyField t={t} label={t('Databento API key', 'คีย์ Databento API')} hint="db-…" saved={credentials.databentoKey}
            onClear={() => update({ databentoKey: undefined })}
            onSave={key => Boolean(buildDatabentoRequestHeaders(key)[AI_HEADERS.databento]) && update({ databentoKey: key })}
            onVerify={key => verifyKey(buildDatabentoRequestHeaders(key))} />
        </div>
      </div>
      {storageError && <p className="byok-feedback" role="alert">{t('Could not save these settings in the browser.', 'บันทึกการตั้งค่าในเบราว์เซอร์ไม่สำเร็จ')}</p>}
    </section>
  );
}

export function AiAndDataKeysDialogButton({ uid, lang, buttonLabel }: CardProps & { buttonLabel?: string }) {
  const [open, setOpen] = useState(false);
  const label = deskText(lang, 'API Keys / Codex OAuth', 'คีย์ API / Codex OAuth');
  return <>
    <button type="button" className="btn xs" data-byok-trigger="true" onClick={() => setOpen(true)}>
      <KeyRound size={13} aria-hidden="true" /> {buttonLabel ?? label}
    </button>
    {open && <DeskDialog label={label} onClose={() => setOpen(false)} panelClassName="byok-dialog">
      <AiAndDataKeysCard uid={uid} lang={lang} />
      <button
        type="button"
        className="btn xs byok-close"
        aria-label={deskText(lang, 'Close', 'ปิด')}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(false);
        }}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </DeskDialog>}
  </>;
}
