"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action";
import { generateDueTasks, saveSop } from "./service";

export async function saveSopAction(input: unknown) {
  const res = await runAction((ctx) => saveSop(ctx, input));
  if (res.ok) revalidatePath("/work/sops");
  return res;
}

export async function generateDueTasksAction(input: unknown) {
  const res = await runAction((ctx) => generateDueTasks(ctx, input));
  if (res.ok && res.data.created > 0) {
    revalidatePath("/work/sops");
    revalidatePath("/work/tasks");
  }
  return res;
}
