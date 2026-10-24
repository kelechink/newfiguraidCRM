"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action";
import { convertQuote, recordInvoicePayment, renderInvoicePdf, saveInvoice, sendInvoice, voidInvoice } from "./invoices-service";
import { approveBill, createBill, createExpense, decideExpense, markExpensePaid, payBill, recordIncome } from "./money-service";
import { addSupplierPrice, createResale, saveDomain, saveSupplier } from "./procurement-service";
import { exportFinanceCsv } from "./reports-service";
import { markSubscriptionUsed, saveSubscription } from "./subscriptions-service";

const r =
  (...paths: string[]) =>
  <T>(p: Promise<T>) =>
    p.then((x) => {
      for (const path of paths) revalidatePath(path, "layout");
      return x;
    });

export async function saveInvoiceAction(input: unknown) {
  return runAction((ctx) => r("/money/invoices")(saveInvoice(ctx, input)));
}
export async function sendInvoiceAction(id: string) {
  return runAction((ctx) => r("/money/invoices")(sendInvoice(ctx, String(id))));
}
export async function voidInvoiceAction(input: unknown) {
  return runAction((ctx) => r("/money/invoices")(voidInvoice(ctx, input)));
}
export async function convertQuoteAction(id: string) {
  return runAction((ctx) => r("/money/invoices")(convertQuote(ctx, String(id))));
}
export async function invoicePdfAction(id: string) {
  return runAction((ctx) => renderInvoicePdf(ctx, String(id)));
}
export async function recordInvoicePaymentAction(input: unknown) {
  return runAction((ctx) => r("/money")(recordInvoicePayment(ctx, input)));
}
export async function recordIncomeAction(input: unknown) {
  return runAction((ctx) => r("/money")(recordIncome(ctx, input)));
}
export async function createExpenseAction(form: FormData) {
  return runAction((ctx) => r("/money")(createExpense(ctx, form)));
}
export async function decideExpenseAction(input: unknown) {
  return runAction((ctx) => r("/money")(decideExpense(ctx, input)));
}
export async function markExpensePaidAction(input: unknown) {
  return runAction((ctx) => r("/money")(markExpensePaid(ctx, input)));
}
export async function createBillAction(input: unknown) {
  return runAction((ctx) => r("/money")(createBill(ctx, input)));
}
export async function approveBillAction(id: string) {
  return runAction((ctx) => r("/money")(approveBill(ctx, String(id))));
}
export async function payBillAction(input: unknown) {
  return runAction((ctx) => r("/money")(payBill(ctx, input)));
}
export async function exportFinanceAction(input: unknown) {
  return runAction((ctx) => exportFinanceCsv(ctx, input));
}
export async function saveSubscriptionAction(input: unknown) {
  return runAction((ctx) => r("/money/subscriptions")(saveSubscription(ctx, input)));
}
export async function markSubscriptionUsedAction(id: string) {
  return runAction((ctx) => r("/money/subscriptions")(markSubscriptionUsed(ctx, String(id))));
}
export async function saveSupplierAction(input: unknown) {
  return runAction((ctx) => r("/money/procurement")(saveSupplier(ctx, input)));
}
export async function createResaleAction(input: unknown) {
  return runAction((ctx) => r("/money/procurement")(createResale(ctx, input)));
}
export async function saveDomainAction(input: unknown) {
  return runAction((ctx) => r("/money/procurement")(saveDomain(ctx, input)));
}
export async function addSupplierPriceAction(input: unknown) {
  return runAction((ctx) => r("/money/procurement")(addSupplierPrice(ctx, input)));
}
