CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Property" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PropertyMedia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Bid" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app_role() RETURNS text AS $$
  SELECT current_setting('app.role', true);
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_tenant() RETURNS uuid AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE POLICY tenant_isolation ON "Tenant"
  USING (app_role() = 'SUPER_ADMIN' OR "id" = app_tenant())
  WITH CHECK (app_role() = 'SUPER_ADMIN' OR "id" = app_tenant());

CREATE POLICY user_tenant_isolation ON "User"
  USING (app_role() = 'SUPER_ADMIN' OR "tenantId" = app_tenant())
  WITH CHECK (app_role() = 'SUPER_ADMIN' OR "tenantId" = app_tenant());

CREATE POLICY usersession_tenant_isolation ON "UserSession"
  USING (app_role() = 'SUPER_ADMIN' OR "tenantId" = app_tenant())
  WITH CHECK (app_role() = 'SUPER_ADMIN' OR "tenantId" = app_tenant());

CREATE POLICY property_tenant_isolation ON "Property"
  USING (app_role() = 'SUPER_ADMIN' OR "tenantId" = app_tenant())
  WITH CHECK (app_role() = 'SUPER_ADMIN' OR "tenantId" = app_tenant());

CREATE POLICY propertymedia_tenant_isolation ON "PropertyMedia"
  USING (app_role() = 'SUPER_ADMIN' OR "tenantId" = app_tenant())
  WITH CHECK (app_role() = 'SUPER_ADMIN' OR "tenantId" = app_tenant());

CREATE POLICY appointment_tenant_isolation ON "Appointment"
  USING (app_role() = 'SUPER_ADMIN' OR "tenantId" = app_tenant())
  WITH CHECK (app_role() = 'SUPER_ADMIN' OR "tenantId" = app_tenant());

CREATE POLICY bid_tenant_isolation ON "Bid"
  USING (app_role() = 'SUPER_ADMIN' OR "tenantId" = app_tenant())
  WITH CHECK (app_role() = 'SUPER_ADMIN' OR "tenantId" = app_tenant());

CREATE POLICY message_tenant_isolation ON "Message"
  USING (app_role() = 'SUPER_ADMIN' OR "tenantId" = app_tenant())
  WITH CHECK (app_role() = 'SUPER_ADMIN' OR "tenantId" = app_tenant());

CREATE POLICY audit_tenant_isolation ON "AuditLog"
  USING (app_role() = 'SUPER_ADMIN' OR "tenantId" = app_tenant() OR "tenantId" IS NULL)
  WITH CHECK (app_role() = 'SUPER_ADMIN' OR "tenantId" = app_tenant() OR "tenantId" IS NULL);
