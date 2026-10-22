"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action";
import { createTask, getTaskDetail, moveTask, toggleChecklistItem } from "./service";

export async function createTaskAction(input: unknown) {
  const res = await runAction((ctx) => createTask(ctx, input));
  if (res.ok) revalidatePath("/work/tasks");
  return res;
}

// No revalidate: the board already shows the move optimistically.
export async function moveTaskAction(input: unknown) {
  return runAction((ctx) => moveTask(ctx, input));
}

export async function toggleChecklistAction(input: unknown) {
  return runAction((ctx) => toggleChecklistItem(ctx, input));
}

export async function getTaskDetailAction(taskId: string) {
  return runAction((ctx) => getTaskDetail(ctx, String(taskId)));
}
