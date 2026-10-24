"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action";
import { deleteTarget, generateTargetTasks, setFocus, setTarget, submitReport, updateCustomAchieved } from "./service";

const done = <T>(p: Promise<T>) =>
  p.then((r) => {
    revalidatePath("/work/targets");
    return r;
  });

export async function setTargetAction(input: unknown) {
  return runAction((ctx) => done(setTarget(ctx, input)));
}
export async function deleteTargetAction(id: string) {
  return runAction((ctx) => done(deleteTarget(ctx, String(id))));
}
export async function updateCustomAchievedAction(input: unknown) {
  return runAction((ctx) => done(updateCustomAchieved(ctx, input)));
}
export async function generateTargetTasksAction(input: unknown) {
  return runAction((ctx) => done(generateTargetTasks(ctx, input)));
}
export async function submitReportAction(input: unknown) {
  return runAction((ctx) => done(submitReport(ctx, input)));
}
export async function setFocusAction(input: unknown) {
  const res = await runAction((ctx) => setFocus(ctx, input));
  revalidatePath("/", "layout");
  return res;
}
