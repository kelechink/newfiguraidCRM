"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action";
import { requestIp, requestUserAgent } from "@/server/ratelimit";
import {
  cancelLeave,
  clockState,
  decideDevice,
  decideExcuse,
  decideLeave,
  exportMonthCsv,
  monthCalendar,
  punch,
  requestLeave,
  reviewPunch,
  saveOffice,
  submitExcuse,
} from "./service";

const refresh = <T>(p: Promise<T>) =>
  p.then((r) => {
    revalidatePath("/work/attendance");
    return r;
  });

export async function clockStateAction(fingerprint: string | null) {
  return runAction((ctx) => clockState(ctx, fingerprint && /^[a-f0-9]{64}$/.test(fingerprint) ? fingerprint : null));
}
export async function punchAction(form: FormData) {
  const meta = { ip: await requestIp(), userAgent: await requestUserAgent() };
  return runAction((ctx) => refresh(punch(ctx, form, meta)));
}
export async function monthCalendarAction(input: unknown) {
  return runAction((ctx) => monthCalendar(ctx, input));
}
export async function reviewPunchAction(input: unknown) {
  return runAction((ctx) => refresh(reviewPunch(ctx, input)));
}
export async function decideDeviceAction(input: unknown) {
  return runAction((ctx) => refresh(decideDevice(ctx, input)));
}
export async function requestLeaveAction(input: unknown) {
  return runAction((ctx) => refresh(requestLeave(ctx, input)));
}
export async function decideLeaveAction(input: unknown) {
  return runAction((ctx) => refresh(decideLeave(ctx, input)));
}
export async function cancelLeaveAction(id: string) {
  return runAction((ctx) => refresh(cancelLeave(ctx, String(id))));
}
export async function submitExcuseAction(input: unknown) {
  return runAction((ctx) => refresh(submitExcuse(ctx, input)));
}
export async function decideExcuseAction(input: unknown) {
  return runAction((ctx) => refresh(decideExcuse(ctx, input)));
}
export async function exportAttendanceAction(month: string) {
  return runAction((ctx) => exportMonthCsv(ctx, String(month)));
}
export async function saveOfficeAction(input: unknown) {
  const res = await runAction((ctx) => saveOffice(ctx, input));
  revalidatePath("/settings/general");
  return res;
}
