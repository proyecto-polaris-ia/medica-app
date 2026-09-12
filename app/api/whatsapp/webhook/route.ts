import { NextRequest, NextResponse } from 'next/server';
import { createWhatsAppAiCorrelationContext, recordWhatsAppAiEvent } from '@/lib/observability/whatsapp-ai';
import { processWhatsAppWebhookPayload } from '@/lib/whatsapp/inbound-service';
import { sendWhatsAppTypingIndicator } from '@/lib/whatsapp/client';
import { isEveWhatsAppEnabled } from '@/lib/whatsapp/eve-flag';
import { verifyWhatsAppWebhookSignature } from '@/lib/whatsapp/signature';
import { WhatsAppStoreConfigurationError } from '@/lib/whatsapp/store';
import type { WhatsAppAiCorrelationContext } from '@/lib/observability/whatsapp-ai';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');
  if (process.env.WHATSAPP_VERIFY_TOKEN && mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const context = createWhatsAppAiCorrelationContext({ requestId: request.headers.get('x-vercel-id') ?? request.headers.get('x-request-id') ?? undefined });
  recordWhatsAppAiEvent({ context, type: 'webhook.received', outcome: 'success' });
  const signature = verifyWhatsAppWebhookSignature({ rawBody, signatureHeader: request.headers.get('x-hub-signature-256') });
  if (!signature.ok) {
    recordWhatsAppAiEvent({ context, type: 'webhook.rejected', outcome: 'failure', diagnostics: { reason: signature.reason } });
    if (signature.reason === 'missing_secret') return NextResponse.json({ error: 'WhatsApp webhook signing secret is not configured' }, { status: 503 });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 }); }

  const messageId = extractMessageId(payload);
  await showTypingIndicator(messageId, context);

  if (isEveWhatsAppEnabled(process.env.WHATSAPP_EVE_ENABLED)) {
    logRouteDecision(context, 'eve', messageId);
    const eveResponse = await forwardToEve(request, rawBody);
    if (eveResponse) return eveResponse;
    // Forward failure: fall through to the legacy path so no message is dropped.
    console.warn('[Eve] forward failed, falling back to legacy agent', { correlationId: context.correlationId });
  }

  logRouteDecision(context, 'legacy', messageId);
  return handleLegacy(payload, context);
}

async function forwardToEve(request: NextRequest, rawBody: string): Promise<NextResponse | null> {
  try {
    const eveWebhookUrl = new URL('/eve/v1/whatsapp', request.url);
    const response = await fetch(eveWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': request.headers.get('x-hub-signature-256') ?? '',
      },
      body: rawBody,
    });
    const body = await response.arrayBuffer();
    const headers = new Headers();
    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });
    return new NextResponse(body, { status: response.status, headers });
  } catch (error) {
    console.error('[Eve] forwarding error:', error);
    return null;
  }
}

async function handleLegacy(payload: unknown, context: WhatsAppAiCorrelationContext): Promise<NextResponse> {
  try {
    recordWhatsAppAiEvent({ context, type: 'webhook.accepted', outcome: 'success' });
    return NextResponse.json(await processWhatsAppWebhookPayload(payload, { observabilityContext: context }));
  } catch (error) {
    recordWhatsAppAiEvent({ context, type: 'webhook.failed', outcome: 'failure', diagnostics: { error } });
    if (error instanceof WhatsAppStoreConfigurationError) return NextResponse.json({ error: 'WhatsApp webhook persistence is not configured' }, { status: 503 });
    return NextResponse.json({ error: 'WhatsApp webhook processing failed' }, { status: 500 });
  }
}

function extractMessageId(payload: unknown): string | undefined {
  try {
    const entry = (payload as { entry?: Array<{ changes?: Array<{ value?: { messages?: Array<{ id?: string; type?: string }> } }> }> })?.entry?.[0];
    const value = entry?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (message?.type !== 'text') return undefined;
    const messageId = message.id;
    return typeof messageId === 'string' ? messageId : undefined;
  } catch {
    return undefined;
  }
}

async function showTypingIndicator(messageId: string | undefined, context: WhatsAppAiCorrelationContext) {
  if (!messageId) return;

  const result = await sendWhatsAppTypingIndicator({ messageId });
  if (!result.ok) {
    console.warn('[WhatsApp] typing indicator failed', {
      correlationId: context.correlationId,
      messageId,
      skipped: result.skipped,
      status: result.status,
      error: result.error,
    });
  }
}

function logRouteDecision(context: WhatsAppAiCorrelationContext, agent: 'eve' | 'legacy', messageId?: string) {
  console.log(JSON.stringify({
    type: 'whatsapp_webhook_route',
    agent,
    correlationId: context.correlationId,
    ...(messageId ? { messageId } : {}),
    timestamp: new Date().toISOString(),
  }));
}
