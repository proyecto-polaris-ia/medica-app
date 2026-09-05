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
      ready?: (callback: () => void) => void;
    };
  }
}

export function TurnstileWidget({
  siteKey,
  onToken,
  onExpire,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    const existing = document.querySelector(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
    );

    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }

    const renderWidget = () => {
      if (!window.turnstile || !containerRef.current) return;

      window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onToken,
        'expired-callback': onExpire,
      });
    };

    if (window.turnstile && window.turnstile.ready) {
      window.turnstile.ready(renderWidget);
    } else {
      // Poll briefly until the script loads.
      const interval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(interval);
          renderWidget();
        }
      }, 100);

      return () => clearInterval(interval);
    }
  }, [siteKey, onToken, onExpire]);

  if (!siteKey) {
    return null;
  }

  return <div ref={containerRef} data-testid="turnstile-widget" />;
}
