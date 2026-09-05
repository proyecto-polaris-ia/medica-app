import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnstileWidget } from '../TurnstileWidget';

describe('TurnstileWidget', () => {
  const renderWidget = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();

    const script = document.querySelector(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
    );
    if (script) {
      script.remove();
    }

    window.turnstile = {
      render: renderWidget,
      ready: vi.fn((cb: () => void) => cb()),
    } as unknown as typeof window.turnstile;
  });

  it('renders a container for the widget', () => {
    render(
      <TurnstileWidget siteKey="site-key" onToken={vi.fn()} onExpire={vi.fn()} />
    );

    expect(screen.getByTestId('turnstile-widget')).toBeInTheDocument();
  });

  it('calls onToken when the widget emits a token', async () => {
    const onToken = vi.fn();
    renderWidget.mockImplementation((_element, options) => {
      options.callback('token-123');
      return 'widget-id';
    });

    render(
      <TurnstileWidget siteKey="site-key" onToken={onToken} onExpire={vi.fn()} />
    );

    await waitFor(() => {
      expect(onToken).toHaveBeenCalledWith('token-123');
    });
  });

  it('calls onExpire when the token expires', async () => {
    const onExpire = vi.fn();
    renderWidget.mockImplementation((_element, options) => {
      options['expired-callback']();
      return 'widget-id';
    });

    render(
      <TurnstileWidget siteKey="site-key" onToken={vi.fn()} onExpire={onExpire} />
    );

    await waitFor(() => {
      expect(onExpire).toHaveBeenCalled();
    });
  });

  it('does not render when siteKey is missing', () => {
    render(
      <TurnstileWidget siteKey="" onToken={vi.fn()} onExpire={vi.fn()} />
    );

    expect(screen.queryByTestId('turnstile-widget')).not.toBeInTheDocument();
  });
});
