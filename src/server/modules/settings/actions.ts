"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action";
import { addHoliday, removeHoliday, saveSetting } from "./service";

const done = <T>(p: Promise<T>) =>
  p.then((r) => {
    revalidatePath("/settings/general");
    return r;
  });

export async function saveSettingAction(input: unknown) {
  return runAction((ctx) => done(saveSetting(ctx, input)));
}
export async function addHolidayAction(input: unknown) {
  return runAction((ctx) => done(addHoliday(ctx, input)));
}
export async function removeHolidayAction(id: string) {
  return runAction((ctx) => done(removeHoliday(ctx, String(id))));
}
