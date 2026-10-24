-- Figuraid's attendance office (confirmed by the founder, Oct 2026).
-- Clock-ins within 100 m count as on site; change the radius in Settings → Offices.
INSERT INTO "Office" ("id", "name", "address", "latitude", "longitude", "radiusM", "timezone", "isActive")
SELECT 'office_kano_house', 'Kano House, Abuja', 'Kano House, 72 Ralph Shodeinde Street, Central Business District, Abuja', 9.051622, 7.496790, 100, 'Africa/Lagos', true
WHERE NOT EXISTS (SELECT 1 FROM "Office" WHERE "name" = 'Kano House, Abuja');
