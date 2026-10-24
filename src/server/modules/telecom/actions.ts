"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action";
import { invoiceCycle, openDispute, postLedger, recordVendorStatement, updateDispute, ledger } from "./billing-service";
import { saveAccount, saveCarrier, saveCarrierBankDetails } from "./carriers-service";
import { exportRateDeck, importRateDeck, rateHistory, saveRoute, setRate } from "./rates-service";
import { enterTraffic, importCdr } from "./traffic-service";

const done = <T>(p: Promise<T>) =>
  p.then((x) => {
    revalidatePath("/money/telecom", "layout");
    return x;
  });

export async function saveCarrierAction(input: unknown) {
  return runAction((ctx) => done(saveCarrier(ctx, input)));
}
export async function saveCarrierBankAction(input: unknown) {
  return runAction((ctx) => done(saveCarrierBankDetails(ctx, input)));
}
export async function saveAccountAction(input: unknown) {
  return runAction((ctx) => done(saveAccount(ctx, input)));
}
export async function saveRouteAction(input: unknown) {
  return runAction((ctx) => done(saveRoute(ctx, input)));
}
export async function setRateAction(input: unknown) {
  return runAction((ctx) => done(setRate(ctx, input)));
}
export async function rateHistoryAction(input: unknown) {
  return runAction((ctx) => rateHistory(ctx, input));
}
export async function importRateDeckAction(form: FormData) {
  return runAction((ctx) => done(importRateDeck(ctx, form)));
}
export async function exportRateDeckAction(input: unknown) {
  return runAction((ctx) => exportRateDeck(ctx, input));
}
export async function enterTrafficAction(input: unknown) {
  return runAction((ctx) => done(enterTraffic(ctx, input)));
}
export async function importCdrAction(form: FormData) {
  return runAction((ctx) => done(importCdr(ctx, form)));
}
export async function invoiceCycleAction(input: unknown) {
  return runAction((ctx) => done(invoiceCycle(ctx, input)));
}
export async function vendorStatementAction(input: unknown) {
  return runAction((ctx) => done(recordVendorStatement(ctx, input)));
}
export async function openDisputeAction(input: unknown) {
  return runAction((ctx) => done(openDispute(ctx, input)));
}
export async function updateDisputeAction(input: unknown) {
  return runAction((ctx) => done(updateDispute(ctx, input)));
}
export async function postLedgerAction(input: unknown) {
  return runAction((ctx) => done(postLedger(ctx, input)));
}
export async function ledgerAction(input: unknown) {
  return runAction((ctx) => ledger(ctx, input));
}
