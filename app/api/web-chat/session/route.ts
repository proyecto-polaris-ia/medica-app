import { NextResponse } from 'next/server';
import { createWebChatSession } from '@/lib/web-chat/store';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const session = await createWebChatSession();

    return NextResponse.json({
      sessionId: session.id,
      createdAt: session.created_at,
    });
  } catch (error) {
    console.error('Error creating web chat session:', error);
    return NextResponse.json(
      { error: 'Could not create session' },
      { status: 500 }
    );
  }
}
