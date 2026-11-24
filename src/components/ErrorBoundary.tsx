import React, { Component, ErrorInfo, ReactNode } from 'react';
import { TallyNxLogo } from './TallyNxLogo';
import { deskText, normalizeDeskLanguage } from '../utils/deskI18n';
import type { DeskLanguage } from '../utils/deskI18n';

interface Props {
  lang?: DeskLanguage;
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Tredyn ErrorBoundary caught runtime error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearStorageAndReload = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      if ('caches' in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => caches.delete(key));
        });
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          registrations.forEach((reg) => reg.unregister());
        });
      }
    } catch (e) {
      console.warn('Clear storage error:', e);
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const lang = this.props.lang ?? normalizeDeskLanguage(typeof document === 'undefined' ? undefined : document.documentElement.lang);
      const t = (english: string, thai: string) => deskText(lang, english, thai);
      const detail = this.state.error?.message || String(this.state.error);
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--bg-canvas, #F9F8F6)',
            padding: '24px',
            fontFamily:
              "'Inter', 'IBM Plex Sans Thai', -apple-system, BlinkMacSystemFont, sans-serif",
            color: 'var(--text-primary, #18181B)',
          }}
        >
          <div
            style={{
              maxWidth: '520px',
              width: '100%',
              backgroundColor: 'var(--bg-surface-solid, #FFFFFF)',
              borderRadius: '8px',
              padding: '36px 30px',
              boxShadow: 'var(--shadow-md)',
              border: '1px solid var(--border-color, #E5E3DD)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '12px',
                background: 'var(--bg-canvas, #FFFFFF)',
                color: 'var(--accent-ink, #0752E8)',
                border: '1px solid var(--border-strong, #CBD5E1)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <TallyNxLogo size={42} lang={lang} />
            </div>
            <h1
              style={{
                fontSize: '20px',
                fontWeight: 600,
                margin: '0 0 8px 0',
                color: 'var(--text-primary, #18181B)',
              }}
            >
              {this.props.fallbackTitle || t("TallyNX Desk · Recover workspace", "TallyNX Desk · กู้คืนหน้าต่าง")}
            </h1>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--text-secondary, #52525B)',
                lineHeight: 1.6,
                margin: '0 0 20px 0',
              }}
            >
              {t("The workspace ran into an error. Reload the page to reopen the data saved in IndexedDB on this device.", "หน้าต่างระบบขัดข้องชั่วคราว กดรีเฟรชเพื่อโหลดข้อมูลจาก IndexedDB ในเครื่องใหม่")}
            </p>

            {this.state.error && (
              <div
                style={{
                  backgroundColor: 'var(--rose-soft, #F8EDF0)',
                  border: '1px solid var(--rose-border, #E6C7D1)',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--rose, #881337)',
                  textAlign: 'left',
                  maxHeight: '120px',
                  overflowY: 'auto',
                  marginBottom: '24px',
                  wordBreak: 'break-word',
                }}
              >
                {lang === 'en' && /[\u0e00-\u0e7f]/.test(detail) ? 'An unexpected workspace error occurred.' : detail}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  background: 'var(--accent, #0752E8)',
                  color: '#ffffff',
                  fontWeight: 500,
                  fontSize: '14px',
                  padding: '10px 20px',
                  borderRadius: '6px',
                  border: '1px solid var(--accent, #0752E8)',
                  cursor: 'pointer',
                }}
              >
                {t("Reload page", "รีเฟรชหน้าต่าง")}
              </button>
              <button
                type="button"
                onClick={this.handleClearStorageAndReload}
                style={{
                  backgroundColor: 'var(--bg-surface-solid, #FFFFFF)',
                  color: 'var(--text-secondary, #52525B)',
                  fontWeight: 600,
                  fontSize: '14px',
                  padding: '11px 20px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color, #E5E3DD)',
                  cursor: 'pointer',
                }}
              >
                {t("🗑️ Clear cache and restart", "🗑️ ล้างแคชเริ่มใหม่")}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
