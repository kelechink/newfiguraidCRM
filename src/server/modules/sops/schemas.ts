import { z } from "zod";
import { PRIORITIES } from "@/server/modules/tasks/schemas";

const id = z.string().cuid();

export const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "ON_DEMAND"] as const;

export const SopInput = z
  .object({
    id: id.optional(), // present = edit
    title: z.string().trim().min(2, "Give the SOP a title").max(200),
    summary: z.string().trim().max(2000).optional(),
    unitId: id,
    frequency: z.enum(FREQUENCIES),
    weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
    dayOfMonth: z.number().int().min(1).max(31).nullable().default(null),
    dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time, e.g. 17:00"),
    defaultPriority: z.enum(PRIORITIES).default("MEDIUM"),
    assigneeIds: z.array(id).max(50).default([]),
    steps: z
      .array(z.object({ title: z.string().trim().min(1).max(300), detail: z.string().trim().max(2000).optional() }))
      .min(1, "Add at least one step")
      .max(100),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, c) => {
    if (v.frequency === "WEEKLY" && v.weekdays.length === 0) {
      c.addIssue({ code: "custom", path: ["weekdays"], message: "Pick at least one day" });
    }
    if (v.frequency === "MONTHLY" && !v.dayOfMonth) {
      c.addIssue({ code: "custom", path: ["dayOfMonth"], message: "Pick a day of the month" });
    }
    if (v.frequency !== "ON_DEMAND" && v.assigneeIds.length === 0) {
      c.addIssue({ code: "custom", path: ["assigneeIds"], message: "Scheduled SOPs need at least one assignee" });
    }
  });
export type SopInputT = z.infer<typeof SopInput>;

export const GenerateInput = z.object({
  sopId: id.optional(), // omit = every SOP in scope
  dryRun: z.boolean().default(false),
});
