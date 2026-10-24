-- Founder's rule (Oct 2026): leads not followed up within 90 days are deleted.
UPDATE "RetentionRule" SET "afterDays" = 90, "action" = 'delete' WHERE "entity" = 'contact_lead';
