"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action";
import { requestIp, requestUserAgent } from "@/server/ratelimit";
import { approveTemplate, generatePack, issueAddendum, renderSignedPdf, saveTemplate, signDocument } from "./contracts-service";
import { addManualDeduction, savePolicy, waiveDeduction } from "./deductions-service";
import { closeExit, computeFinalPay, openExit, revokeAccess, toggleExitItem } from "./exit-service";
import { adjustPayslip, createRun, exportBankSchedule, recalculateRun, renderPayslip, transitionRun } from "./payroll-service";
import { saveBank, savePay, saveProfile } from "./staff-service";

const done =
  (...paths: string[]) =>
  <T>(p: Promise<T>) =>
    p.then((x) => {
      for (const path of paths) revalidatePath(path, "layout");
      return x;
    });
const team = done("/team", "/me");

export async function saveProfileAction(input: unknown) {
  return runAction((ctx) => team(saveProfile(ctx, input)));
}
export async function savePayAction(input: unknown) {
  return runAction((ctx) => team(savePay(ctx, input)));
}
export async function saveBankAction(input: unknown) {
  return runAction((ctx) => team(saveBank(ctx, input)));
}
export async function savePolicyAction(input: unknown) {
  return runAction((ctx) => team(savePolicy(ctx, input)));
}
export async function waiveDeductionAction(input: unknown) {
  return runAction((ctx) => team(waiveDeduction(ctx, input)));
}
export async function addDeductionAction(input: unknown) {
  return runAction((ctx) => team(addManualDeduction(ctx, input)));
}
export async function createRunAction(input: unknown) {
  return runAction((ctx) => team(createRun(ctx, input)));
}
export async function adjustPayslipAction(input: unknown) {
  return runAction((ctx) => team(adjustPayslip(ctx, input)));
}
export async function recalculateRunAction(runId: string) {
  return runAction((ctx) => team(recalculateRun(ctx, String(runId))));
}
export async function transitionRunAction(input: unknown) {
  return runAction((ctx) => team(transitionRun(ctx, input)));
}
export async function payslipPdfAction(payslipId: string) {
  return runAction((ctx) => renderPayslip(ctx, String(payslipId)));
}
export async function bankScheduleAction(runId: string) {
  return runAction((ctx) => exportBankSchedule(ctx, String(runId)));
}
export async function saveTemplateAction(input: unknown) {
  return runAction((ctx) => team(saveTemplate(ctx, input)));
}
export async function approveTemplateAction(input: unknown) {
  return runAction((ctx) => team(approveTemplate(ctx, input)));
}
export async function generatePackAction(input: unknown) {
  return runAction((ctx) => team(generatePack(ctx, input)));
}
export async function addendumAction(input: unknown) {
  return runAction((ctx) => team(issueAddendum(ctx, input)));
}
export async function signDocumentAction(input: unknown) {
  return runAction(async (ctx) => team(signDocument(ctx, input, { ip: await requestIp(), userAgent: await requestUserAgent() })));
}
export async function signedPdfAction(documentId: string) {
  return runAction((ctx) => renderSignedPdf(ctx, String(documentId)));
}
export async function openExitAction(input: unknown) {
  return runAction((ctx) => team(openExit(ctx, input)));
}
export async function toggleExitItemAction(input: unknown) {
  return runAction((ctx) => team(toggleExitItem(ctx, input)));
}
export async function finalPayAction(exitId: string) {
  return runAction((ctx) => team(computeFinalPay(ctx, String(exitId))));
}
export async function revokeAccessAction(exitId: string) {
  return runAction((ctx) => team(revokeAccess(ctx, String(exitId))));
}
export async function closeExitAction(exitId: string) {
  return runAction((ctx) => team(closeExit(ctx, String(exitId))));
}
