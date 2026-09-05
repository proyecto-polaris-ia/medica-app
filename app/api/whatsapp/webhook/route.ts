import { NextRequest, NextResponse } from 'next/server';
import { createWhatsAppAiCorrelationContext, recordWhatsAppAiEvent } from '@/lib/observability/whatsapp-ai';
import { processWhatsAppWebhookPayload } from '@/lib/whatsapp/inbound-service';
import { verifyWhatsAppWebhookSignature } from '@/lib/whatsapp/signature';
import { WhatsAppStoreConfigurationError } from '@/lib/whatsapp/store';

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
  try {
    recordWhatsAppAiEvent({ context, type: 'webhook.accepted', outcome: 'success' });
    return NextResponse.json(await processWhatsAppWebhookPayload(payload, { observabilityContext: context }));
  } catch (error) {
    recordWhatsAppAiEvent({ context, type: 'webhook.failed', outcome: 'failure', diagnostics: { error } });
    if (error instanceof WhatsAppStoreConfigurationError) return NextResponse.json({ error: 'WhatsApp webhook persistence is not configured' }, { status: 503 });
    return NextResponse.json({ error: 'WhatsApp webhook processing failed' }, { status: 500 });
  }
}
