import { z } from "zod";

const id = z.string().cuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const PunchFields = z.object({
  type: z.enum(["IN", "OUT"]),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  accuracy: z.coerce.number().min(0).max(100_000).optional(),
  deviceTime: z.coerce.date(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  // FormData sends strings; z.coerce.boolean("false") would be true
  wasOffline: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  deviceLabel: z.string().max(120).optional(),
});

export const ReviewInput = z.object({ punchId: id, decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().trim().max(500).optional() });
export const DeviceDecision = z.object({ deviceId: id, approve: z.boolean() });
export const LeaveInput = z
  .object({
    type: z.enum(["ANNUAL", "SICK", "CASUAL", "MATERNITY", "PATERNITY", "COMPASSIONATE", "UNPAID", "STUDY"]),
    startDate: date,
    endDate: date,
    reason: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "End date must be on or after the start" });
export const LeaveDecision = z.object({ leaveId: id, approve: z.boolean() });
export const ExcuseInput = z.object({ date, reason: z.string().trim().min(5, "Explain what happened").max(1000) });
export const ExcuseDecision = z.object({ excuseId: id, approve: z.boolean() });
export const MonthInput = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), userId: id.optional() });
export const OfficeInput = z.object({
  id: id.optional(),
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().max(200).optional(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusM: z.coerce.number().int().min(10).max(5000).default(100),
  isActive: z.boolean().default(true),
});
