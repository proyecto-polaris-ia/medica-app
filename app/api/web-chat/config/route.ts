import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const config = {
    clinicName: process.env.WEB_CHAT_CLINIC_NAME || 'Consultorio Dental',
    greeting: process.env.WEB_CHAT_GREETING || '¡Hola! Soy el asistente virtual del consultorio. ¿En qué puedo ayudarte?',
    primaryColor: process.env.WEB_CHAT_PRIMARY_COLOR || '#2563eb',
    accentColor: process.env.WEB_CHAT_ACCENT_COLOR || '#1d4ed8',
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '',
    enabled: process.env.WEB_CHAT_ENABLED !== 'false' ? true : false,
  };

  return NextResponse.json(config);
}
