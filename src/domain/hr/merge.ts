// Contract templates: markdown with {{merge.fields}}. Rendering is pure so the
// exact signed text can be frozen and hashed.
import { createHash } from "node:crypto";

export const MERGE_FIELDS = [
  "staff.name",
  "staff.email",
  "staff.jobTitle",
  "staff.employeeNo",
  "staff.employmentType",
  "staff.startDate",
  "staff.probationEnds",
  "staff.resumeTime",
  "staff.closeTime",
  "staff.workingDays",
  "unit.name",
  "company.name",
  "company.address",
  "policy.summary",
  "addendum.body",
  "exit.lastWorkingDay",
  "exit.type",
  "today",
] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];

/** Fields used in a template that we don't know how to fill. */
export function unknownFields(body: string): string[] {
  const known = new Set<string>(MERGE_FIELDS);
  return [...new Set([...body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]!))].filter((f) => !known.has(f));
}

/** Fill merge fields; unknown or empty ones render as a visible blank so nothing silently disappears. */
export function renderTemplate(body: string, values: Partial<Record<MergeField, string>>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => {
    const v = values[k as MergeField];
    return v != null && v !== "" ? v : "________";
  });
}

export const contentHash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** Typed-name signature must match the account name (case, spacing and punctuation ignored). */
export function namesMatch(typed: string, accountName: string): boolean {
  const n = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
  return n(typed).length >= 3 && n(typed) === n(accountName);
}
