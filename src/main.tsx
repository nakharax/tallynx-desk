import { createRoot } from 'react-dom/client';
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

const SENSITIVE_ANALYTICS_PARAMS = [
  'code', 'state', 'token', 'key', 'invite', 'api_key',
  'balance', 'risk_pct', 'sl_pips', 'daily_dd',
];

function sanitizeAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent {
  try {
    const url = new URL(event.url);
    for (const param of SENSITIVE_ANALYTICS_PARAMS) {
      url.searchParams.delete(param);
    }
    return { ...event, url: url.toString() };
  } catch {
    return event;
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <ErrorBoundary>
      <App />
      <Analytics beforeSend={sanitizeAnalyticsEvent} />
      <SpeedInsights />
    </ErrorBoundary>
  );
}

// Register PWA service worker asynchronously without blocking initial render
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    let hadController = Boolean(navigator.serviceWorker.controller);
    let reloadingForSw = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) {
        hadController = true;
        return;
      }
      if (!reloadingForSw) {
        reloadingForSw = true;
        window.location.reload();
      }
    });

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        void updateSW(true);
      },
      onRegisteredSW(_swUrl, r) {
        if (r) {
          void r.update().catch(() => null);
        }
      },
      onRegisterError(error) {
        console.warn('Tredyn PWA SW error:', error);
      },
    });
  } catch (swErr) {
    console.warn('Tredyn SW registration caught:', swErr);
  }
}

