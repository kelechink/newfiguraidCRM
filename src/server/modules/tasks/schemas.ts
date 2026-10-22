import { z } from "zod";

const id = z.string().cuid();

export const BOARD_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const ORIGINS = ["FOUNDER", "TEAM_LEAD", "SOP"] as const;

export const BoardFilterInput = z.object({
  unitId: id.nullable().default(null),
  origin: z.enum(ORIGINS).nullable().default(null),
  mineOnly: z.boolean().default(false),
});
export type BoardFilter = z.infer<typeof BoardFilterInput>;

// Note: no `origin` field — origin is derived from the creator's role on the server.
export const CreateTaskInput = z.object({
  title: z.string().trim().min(2, "Give the task a title").max(200),
  description: z.string().trim().max(5000).optional(),
  unitId: id,
  assigneeId: id,
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  dueAt: z.coerce.date().optional(),
});
export type CreateTask = z.infer<typeof CreateTaskInput>;

export const MoveTaskInput = z.object({
  taskId: id,
  status: z.enum(BOARD_STATUSES),
  beforeId: id.nullable(), // card now directly above the moved card (null = top)
  afterId: id.nullable(), // card now directly below (null = bottom)
});
export type MoveTask = z.infer<typeof MoveTaskInput>;

export const ToggleChecklistInput = z.object({ itemId: id, done: z.boolean() });
