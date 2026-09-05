-- Remove summary column from whatsapp_conversations table
ALTER TABLE whatsapp_conversations DROP COLUMN IF EXISTS summary;
