-- Default retention windows (review with the DPO; editable in the database until a UI is added).
INSERT INTO "RetentionRule" ("id", "entity", "afterDays", "action", "isActive") VALUES
  ('ret_contact_lead', 'contact_lead', 730, 'anonymise', true),
  ('ret_webhook_event', 'webhook_event', 90, 'delete', true),
  ('ret_login_attempt', 'login_attempt', 180, 'delete', true),
  ('ret_ai_interaction', 'ai_interaction', 180, 'delete', true)
ON CONFLICT ("entity") DO NOTHING;
