-- Create knowledge-service links table
CREATE TABLE IF NOT EXISTS whatsapp_knowledge_service_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_entry_id uuid NOT NULL REFERENCES whatsapp_knowledge_entries(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(knowledge_entry_id, service_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_knowledge_service_links_knowledge_entry_id
  ON whatsapp_knowledge_service_links(knowledge_entry_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_knowledge_service_links_service_id
  ON whatsapp_knowledge_service_links(service_id);

-- Enable RLS
ALTER TABLE whatsapp_knowledge_service_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_knowledge_service_links FORCE ROW LEVEL SECURITY;

-- RLS policies: admin-only write, agent read
CREATE POLICY "whatsapp_knowledge_service_links_admin_all"
  ON whatsapp_knowledge_service_links FOR ALL TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- Revoke anonymous access
REVOKE ALL ON whatsapp_knowledge_service_links FROM anon;
REVOKE ALL ON whatsapp_knowledge_service_links FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_knowledge_service_links TO authenticated;
