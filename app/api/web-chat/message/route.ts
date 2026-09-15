import { NextRequest, NextResponse } from 'next/server';
import { processWebChatMessage } from '@/lib/web-chat/web-inbound-service';
import { verifyTurnstile } from '@/lib/booking/turnstile';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { sessionId, message, phone, fullName, captchaToken } = body;

    if (!sessionId || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, message' },
        { status: 400 }
      );
    }

    if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) {
      return NextResponse.json(
        { error: 'Invalid phone format. Use E.164 format: +5215512345678' },
        { status: 400 }
      );
    }

    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (turnstileSecret) {
      if (!captchaToken) {
        return NextResponse.json(
          { error: 'Captcha verification required' },
          { status: 400 }
        );
      }

      const verified = await verifyTurnstile(captchaToken);
      if (!verified) {
        return NextResponse.json(
          { error: 'Invalid captcha' },
          { status: 400 }
        );
      }
    }

    const result = await processWebChatMessage({
      sessionId,
      message,
      phone,
      fullName,
    });

    return NextResponse.json({
      reply: result.reply,
      flowState: result.flowState,
      requiresPhone: result.requiresPhone,
      booked: result.booked,
      needsHuman: result.needsHuman,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Session not found') {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    console.error('Error processing web chat message:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
