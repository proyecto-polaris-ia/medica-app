'use client';

import { useState, useEffect, useRef } from 'react';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

type ChatConfig = {
  clinicName: string;
  greeting: string;
  primaryColor: string;
  accentColor: string;
  turnstileSiteKey: string;
  enabled: boolean;
};

export default function WidgetPage() {
  const [config, setConfig] = useState<ChatConfig | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPhoneForm, setShowPhoneForm] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const configRes = await fetch('/api/web-chat/config');
        const configData = await configRes.json();
        setConfig(configData);

        if (!configData.enabled) {
          setError('El chat no está disponible en este momento.');
          return;
        }

        const sessionRes = await fetch('/api/web-chat/session', { method: 'POST' });
        const sessionData = await sessionRes.json();
        setSessionId(sessionData.sessionId);

        setMessages([
          {
            id: 'greeting',
            role: 'assistant',
            content: configData.greeting,
            timestamp: new Date(),
          },
        ]);
      } catch (err) {
        setError('Error al iniciar el chat. Por favor, recarga la página.');
      }
    }

    init();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!config?.turnstileSiteKey || !turnstileRef.current || turnstileWidgetId.current) return;

    const renderWidget = () => {
      if (!window.turnstile || !turnstileRef.current) return;

      turnstileWidgetId.current = window.turnstile.render(turnstileRef.current, {
        sitekey: config.turnstileSiteKey,
        callback: (token: string) => setCaptchaToken(token),
        'expired-callback': () => setCaptchaToken(null),
      });
    };

    if (window.turnstile) {
      renderWidget();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = false;
    script.onload = renderWidget;
    document.body.appendChild(script);

    return () => {
      if (turnstileWidgetId.current && window.turnstile?.remove) {
        window.turnstile.remove(turnstileWidgetId.current);
      }
    };
  }, [config?.turnstileSiteKey, showPhoneForm]);

  const sendMessage = async () => {
    if (!input.trim() || !sessionId || loading) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
      },
    ]);

    setLoading(true);

    try {
      const res = await fetch('/api/web-chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: userMessage,
          ...(phone ? { phone } : {}),
          ...(fullName ? { fullName } : {}),
          ...(captchaToken ? { captchaToken } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al enviar mensaje');
      }

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.reply,
          timestamp: new Date(),
        },
      ]);

      if (data.requiresPhone && !phone) {
        setShowPhoneForm(true);
      }

      if (data.booked && phone) {
        setCaptchaToken(null);
        if (turnstileWidgetId.current && window.turnstile) {
          (window.turnstile as any).reset?.(turnstileWidgetId.current);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar mensaje');
    } finally {
      setLoading(false);
    }
  };

  const submitPhoneInfo = () => {
    if (!phone.trim() || !fullName.trim()) return;
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      setError('Formato de teléfono inválido. Usa +5215512345678');
      return;
    }
    setShowPhoneForm(false);
    setError(null);
  };

  if (error && !config) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#ef4444' }}>
        {error}
      </div>
    );
  }

  if (!config || !sessionId) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
        Cargando...
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      backgroundColor: '#f9fafb',
    }}>
      <div style={{
        backgroundColor: config.primaryColor,
        color: 'white',
        padding: '16px',
        fontWeight: 600,
        fontSize: '16px',
      }}>
        {config.clinicName}
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={{
              maxWidth: '80%',
              padding: '10px 14px',
              borderRadius: '12px',
              backgroundColor: msg.role === 'user' ? config.primaryColor : 'white',
              color: msg.role === 'user' ? 'white' : '#111827',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              whiteSpace: 'pre-wrap',
              lineHeight: '1.4',
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '10px 14px',
              borderRadius: '12px',
              backgroundColor: 'white',
              color: '#6b7280',
              fontStyle: 'italic',
            }}>
              Escribiendo...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {showPhoneForm && (
        <div style={{
          padding: '16px',
          backgroundColor: 'white',
          borderTop: '1px solid #e5e7eb',
        }}>
          <div style={{ marginBottom: '12px', fontWeight: 500, color: '#111827' }}>
            Para confirmar tu cita, necesito tus datos:
          </div>
          <input
            type="text"
            placeholder="Nombre completo"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              marginBottom: '8px',
              fontSize: '14px',
            }}
          />
          <input
            type="tel"
            placeholder="Teléfono (ej: +5215512345678)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              marginBottom: '12px',
              fontSize: '14px',
            }}
          />
          {config.turnstileSiteKey && (
            <div ref={turnstileRef} style={{ marginBottom: '12px' }} />
          )}
          {error && (
            <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '8px' }}>
              {error}
            </div>
          )}
          <button
            onClick={submitPhoneInfo}
            disabled={!phone.trim() || !fullName.trim() || (!!config.turnstileSiteKey && !captchaToken)}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: config.primaryColor,
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 500,
              cursor: 'pointer',
              opacity: (!phone.trim() || !fullName.trim() || (!!config.turnstileSiteKey && !captchaToken)) ? 0.5 : 1,
            }}
          >
            Confirmar datos
          </button>
        </div>
      )}

      {!showPhoneForm && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: 'white',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          gap: '8px',
        }}>
          <input
            type="text"
            placeholder="Escribe tu mensaje..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            disabled={loading}
            style={{
              flex: 1,
              padding: '10px 14px',
              border: '1px solid #d1d5db',
              borderRadius: '20px',
              fontSize: '14px',
              outline: 'none',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            style={{
              padding: '10px 20px',
              backgroundColor: config.primaryColor,
              color: 'white',
              border: 'none',
              borderRadius: '20px',
              fontWeight: 500,
              cursor: 'pointer',
              opacity: loading || !input.trim() ? 0.5 : 1,
            }}
          >
            Enviar
          </button>
        </div>
      )}
    </div>
  );
}
