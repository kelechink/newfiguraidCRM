-- Integrity guards that Prisma's schema language cannot express.

-- 1. Audit log is append-only (Security #14). Even the app's DB role cannot rewrite history.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();

-- 2. Rate history is append-only except closing a rate (setting effectiveTo once).
CREATE OR REPLACE FUNCTION rate_history_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Rate rows cannot be deleted; supersede them instead';
  END IF;
  IF NEW."ratePerMin" <> OLD."ratePerMin" OR NEW."effectiveFrom" <> OLD."effectiveFrom"
     OR NEW."routeId" <> OLD."routeId" OR NEW."carrierAccountId" <> OLD."carrierAccountId"
     OR NEW."currency" <> OLD."currency"
     OR (OLD."effectiveTo" IS NOT NULL AND NEW."effectiveTo" IS DISTINCT FROM OLD."effectiveTo") THEN
    RAISE EXCEPTION 'Rate rows are immutable; create a new rate with a new effective date';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rate_history_guard BEFORE UPDATE OR DELETE ON "Rate"
  FOR EACH ROW EXECUTE FUNCTION rate_history_guard();

-- 3. Only one approved attendance device per user (device binding).
CREATE UNIQUE INDEX "Device_one_approved_per_user" ON "Device" ("userId") WHERE status = 'APPROVED';

-- 4. Sanity checks on money and ranges.
ALTER TABLE "Payment"       ADD CONSTRAINT payment_fx_required CHECK (currency = 'NGN' OR "fxRate" IS NOT NULL);
ALTER TABLE "Expense"       ADD CONSTRAINT expense_fx_required CHECK (currency = 'NGN' OR "fxRate" IS NOT NULL);
ALTER TABLE "Expense"       ADD CONSTRAINT expense_amount_positive CHECK (amount > 0);
ALTER TABLE "Rate"          ADD CONSTRAINT rate_non_negative CHECK ("ratePerMin" >= 0);
ALTER TABLE "Rate"          ADD CONSTRAINT rate_window CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");
ALTER TABLE "TrafficEntry"  ADD CONSTRAINT traffic_seconds_non_negative CHECK ("rawSeconds" >= 0);
ALTER TABLE "TrafficEntry"  ADD CONSTRAINT traffic_period CHECK ("periodEnd" >= "periodStart");
ALTER TABLE "CarrierAccount" ADD CONSTRAINT carrier_increments CHECK ("incrementFirst" > 0 AND "incrementNext" > 0);
ALTER TABLE "PipelineStage" ADD CONSTRAINT stage_probability CHECK (probability BETWEEN 0 AND 100);
ALTER TABLE "Ticket"        ADD CONSTRAINT ticket_csat CHECK ("csatScore" IS NULL OR "csatScore" BETWEEN 1 AND 5);
ALTER TABLE "Office"        ADD CONSTRAINT office_radius CHECK ("radiusM" BETWEEN 10 AND 5000);

-- 5. A conversation cannot be RESOLVED without a staff reply or a resolution note (Module K).
--    firstResponseAt is set only by a STAFF/AI-approved outbound reply in the service layer.
ALTER TABLE "Conversation" ADD CONSTRAINT conversation_resolve_requires_answer
  CHECK (status <> 'RESOLVED' OR "firstResponseAt" IS NOT NULL OR "resolutionNote" IS NOT NULL);
