-- Add flow_state column to whatsapp_conversations table
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS flow_state jsonb;
