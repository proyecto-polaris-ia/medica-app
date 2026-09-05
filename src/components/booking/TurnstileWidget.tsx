'use client';

import { useEffect, useRef } from 'react';

type TurnstileWidgetProps = {
  siteKey: string;
  onToken: (token: string) => void;
  onExpire: () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback': () => void;
        }
      ) => string;
      remove?: (widgetId: string) => void;
    };
    onloadTurnstileCallback?: () => void;
  }
}

const TURNSTILE_API_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js';

export function TurnstileWidget({
  siteKey,
  onToken,
  onExpire,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;

    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    const widgetId = widgetIdRef.current;

    // Refs must stay stable across re-renders; the callbacks are captured via
    // a mutable holder so the widget always calls the latest props.
    const renderWidget = () => {
      if (cancelled || !window.turnstile || !containerRef.current) return;

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onToken(token),
        'expired-callback': () => onExpire(),
      });
    };

    // Load the Turnstile script WITHOUT async/defer. Cloudflare's API
    // explicitly rejects turnstile.ready() when the script has async/defer;
    // we instead render the widget from the script's onload callback.
    const ensureScript = (): (() => void) => {
      // If the Turnstile API is already loaded (e.g. another widget loaded it,
      // or a prior script on the page), render immediately.
      if (window.turnstile) {
        renderWidget();
        return () => cleanupWidget();
      }

      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${TURNSTILE_API_URL}"]`
      );

      if (existing) {
        existing.addEventListener('load', renderWidget, { once: true });
        return () => {
          existing.removeEventListener('load', renderWidget);
          cleanupWidget();
        };
      }

      const script = document.createElement('script');
      script.src = TURNSTILE_API_URL;
      script.async = false;
      script.defer = false;
      script.onload = renderWidget;

      document.body.appendChild(script);

      return () => {
        cleanupWidget();
      };
    };

    const cleanupWidget = () => {
      const id = widgetIdRef.current;
      if (id && window.turnstile?.remove) {
        window.turnstile.remove(id);
      }
      widgetIdRef.current = null;
    };

    return ensureScript();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  if (!siteKey) {
    return null;
  }

  return <div ref={containerRef} data-testid="turnstile-widget" />;
}
