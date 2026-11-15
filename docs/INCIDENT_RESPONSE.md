# Data breach & security incident plan

Nigeria Data Protection Act 2023: notify the **Nigeria Data Protection Commission within 72 hours** of becoming aware of a
breach likely to risk people's rights, and tell affected people without undue delay when the risk is high.

## Who does what
| Role | Person | Backup |
|---|---|---|
| Incident lead (decides, notifies NDPC) | Super Admin | Admin |
| Technical containment | IT / hosting contact | Super Admin |
| Communications (staff, customers, carriers) | Operations Manager | Admin |
| Record keeping | Finance | HR |

## First hour
1. **Contain.** Revoke the affected accounts (Admin → Users → *Revoke access now*), *Sign out all devices* for anyone involved,
   change cPanel, database and mailbox passwords, rotate API keys in the server `.env` (Paystack, Flutterwave, WHMCS, Meta, AI).
2. **Preserve evidence.** Do not delete logs. Run `php artisan audit:verify`, export Admin → Audit log and Login history,
   download cPanel access logs and a fresh backup.
3. **Open a record** (date/time found, who found it, what systems, what data, how many people).

## Within 72 hours
4. Assess: what personal data (contacts, staff records, salaries, bank details), how many people, encrypted or not.
   Salaries, bank and ID details are encrypted with `APP_KEY` — if the server `.env` was **not** exposed, they are unreadable.
5. If people's rights are at risk: notify the NDPC (https://ndpc.gov.ng) with the facts, likely consequences and measures taken.
6. If the risk to individuals is high: tell them in plain words what happened, what data, and what they should do.

## Afterwards
7. Fix the root cause, then review this plan. If `APP_KEY` was exposed, rotate it: put the old key in `APP_PREVIOUS_KEYS`,
   set a new `APP_KEY`, then re-save encrypted records.
8. Note the incident in the next management meeting; keep the record for at least 6 years.
