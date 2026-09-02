-- Agenda domain RLS configuration.
-- Enable RLS on all agenda tables and deny anonymous access.
-- The booking service layer runs as service_role (BYPASSRLS), so it is unaffected.
-- Patient-level RLS is deferred until patient auth exists (MVP0).

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE patients, services, providers, business_hours, appointments FROM anon;
