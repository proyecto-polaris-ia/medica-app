-- Add summary column to whatsapp_conversations table
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS summary text;
